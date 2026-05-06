require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const User = require("./models/User");
const Case = require("./models/Case");
const Application = require("./models/Application");

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/nyaysetu")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Connection Error:", err));
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." }
});
app.use(apiLimiter);



// 🔑 PUT YOUR API KEY HERE (⚠️ don’t share publicly)
const GROQ_API_KEY = process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY_HERE";

if (!GROQ_API_KEY || GROQ_API_KEY === "YOUR_GROQ_API_KEY_HERE") {
  console.error("❌ GROQ_API_KEY not set! Please set it in .env file.");
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    profile: user.profile || {},
    createdAt: user.createdAt
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

const CASE_STATUS_FLOW = ["open", "pending_review", "assigned", "approved", "paid", "completed"];

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(v => String(v || "").trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map(v => v.trim()).filter(Boolean);
}

function serializeCase(caseData) {
  if (!caseData) return null;
  const obj = typeof caseData.toObject === "function" ? caseData.toObject() : caseData;
  return {
    ...obj,
    id: String(obj._id || obj.id),
    assignedLawyerId: obj.assignedLawyerId ? String(obj.assignedLawyerId) : null,
    userId: obj.userId ? String(obj.userId?._id || obj.userId) : null,
    progressIndex: Math.max(0, CASE_STATUS_FLOW.indexOf(obj.status)),
    statusFlow: CASE_STATUS_FLOW
  };
}

function getFallbackLawyers() {
  try {
    const dataPath = path.join(__dirname, "data", "lawyers.json");
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

async function resolveLawyerTarget(lawyerId) {
  if (!lawyerId) return null;

  if (isValidObjectId(lawyerId)) {
    const user = await User.findById(lawyerId);
    if (user) return user;
  }

  const fallback = getFallbackLawyers().find(lawyer => String(lawyer.id) === String(lawyerId));
  if (fallback) {
    return { ...fallback, role: 'lawyer', id: String(fallback.id) };
  }

  return null;
}

function mapLawyerForList(lawyer) {
  const profile = lawyer.profile || {};
  const languages = normalizeList(profile.languages || profile.language || lawyer.languages);
  const tags = normalizeList(profile.tags || profile.specializations || profile.keywords || lawyer.keywords || []);
  const fee = Number(profile.l_fee || profile.fee || profile.consultationFee || 1800) || 1800;
  const rating = Number(profile.rating || profile.l_rating || profile.ratingScore || 4.8) || 4.8;
  const verified = profile.verified !== false;
  const summary = String(profile.bio || profile.description || profile.about || lawyer.bio || lawyer.description || "Trusted lawyer with strong experience in handling important client matters.").trim();

  return {
    id: String(lawyer._id || lawyer.id),
    name: lawyer.name || "Unknown Lawyer",
    initials: (lawyer.name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    specialization: profile.l_spec || lawyer.specialization || tags[0] || "General",
    experience: profile.l_exp ? `${profile.l_exp} Years` : lawyer.experience || "8 Years",
    location: profile.l_loc || profile.location || profile.city || "India",
    fee,
    rating,
    verified,
    tags,
    summary,
    languages,
    keywords: normalizeList(profile.keywords || lawyer.keywords)
  };
}

function parseBudgetFilter(value) {
  if (!value || value === 'Any' || value === 'All') return {};
  const cleaned = String(value).replace(/[₹,\s]/g, '');
  if (cleaned.includes('-')) {
    const [min, max] = cleaned.split('-').map(n => Number(n.replace(/[^0-9]/g, '') || 0));
    return { min, max };
  }
  if (cleaned.startsWith('Under')) return { max: Number(cleaned.replace(/[^0-9]/g, '')) };
  if (cleaned.startsWith('Above')) return { min: Number(cleaned.replace(/[^0-9]/g, '')) };
  const num = Number(cleaned.replace(/[^0-9]/g, ''));
  return Number.isFinite(num) ? { min: num } : {};
}

function applyLawyerFilters(lawyers, specialization, location, budget) {
  const budgetRange = parseBudgetFilter(budget);
  return lawyers.filter(lawyer => {
    const specFilter = String(specialization || '').trim().toLowerCase();
    const locationFilter = String(location || '').trim().toLowerCase();
    const fee = Number(lawyer.fee) || 0;
    if (specFilter && specFilter !== 'all') {
      const spec = String(lawyer.specialization || '').toLowerCase();
      const tags = (lawyer.tags || []).map(tag => String(tag || '').toLowerCase());
      if (!spec.includes(specFilter) && !tags.some(tag => tag.includes(specFilter))) return false;
    }
    if (locationFilter && locationFilter !== 'all') {
      const loc = String(lawyer.location || '').toLowerCase();
      if (!loc.includes(locationFilter) && !String(lawyer.tags || []).toLowerCase().includes(locationFilter)) return false;
    }
    if (budgetRange.min && fee < budgetRange.min) return false;
    if (budgetRange.max && fee > budgetRange.max) return false;
    return true;
  });
}

function matchLawyersForCase(lawyers, caseData) {
  const problemType = String(caseData.problemType || "").toLowerCase();
  const caseText = [
    caseData.problemType,
    caseData.summary,
    ...(caseData.facts || [])
  ].filter(Boolean).join(" ").toLowerCase();

  const matched = lawyers.filter(lawyer => {
    const spec = String(lawyer.specialization || "").toLowerCase();
    const keywords = Array.isArray(lawyer.keywords) ? lawyer.keywords : [];
    return spec.includes(problemType) ||
      problemType.includes(spec.split(" ")[0]) ||
      spec === "general" ||
      problemType === "general" ||
      keywords.some(keyword => caseText.includes(String(keyword).toLowerCase()));
  });

  return matched.length ? matched : lawyers;
}

function scoreCaseForLawyer(caseData, lawyer) {
  const profile = lawyer?.profile || {};
  const spec = String(profile.l_spec || profile.specialization || "").toLowerCase();
  const lawyerLocation = String(profile.l_loc || profile.location || profile.city || "").toLowerCase();
  const lawyerLanguages = normalizeList(profile.languages || profile.language).map(v => v.toLowerCase());
  const caseText = [
    caseData.problemType,
    caseData.summary,
    ...(caseData.facts || [])
  ].filter(Boolean).join(" ").toLowerCase();
  const caseLocation = String(caseData.location || "").toLowerCase();
  const caseLanguage = String(caseData.language || "").toLowerCase();

  let score = 0;
  if (spec && caseText.includes(spec.split(" ")[0])) score += 5;
  if (spec && String(caseData.problemType || "").toLowerCase().includes(spec.split(" ")[0])) score += 5;
  if (lawyerLocation && caseLocation && (caseLocation.includes(lawyerLocation) || lawyerLocation.includes(caseLocation))) score += 3;
  if (caseLanguage && lawyerLanguages.includes(caseLanguage)) score += 2;
  if (!spec) score += 1;
  return score;
}

async function getMatchedCasesForLawyer(lawyerId) {
  const query = { status: { $in: ["pending_review", "open"] } };
  const cases = await Case.find(query)
    .select("problemType summary facts location language status createdAt")
    .sort({ createdAt: -1 })
    .limit(40);

  if (!lawyerId || !isValidObjectId(lawyerId)) {
    return cases.slice(0, 5);
  }

  const lawyer = await User.findById(lawyerId);
  if (!lawyer || lawyer.role !== "lawyer") return [];

  return cases
    .map(caseData => ({ caseData, score: scoreCaseForLawyer(caseData, lawyer) }))
    .filter(item => item.score > 0 || cases.length <= 5)
    .sort((a, b) => b.score - a.score || new Date(b.caseData.createdAt) - new Date(a.caseData.createdAt))
    .slice(0, 5)
    .map(item => item.caseData);
}

async function updateCaseStatus(caseId, status, fields = {}) {
  if (!isValidObjectId(caseId)) {
    const err = new Error("Invalid caseId.");
    err.status = 400;
    throw err;
  }

  const caseData = await Case.findById(caseId);
  if (!caseData) {
    const err = new Error("Case not found.");
    err.status = 404;
    throw err;
  }

  caseData.status = status;
  Object.entries(fields).forEach(([key, value]) => {
    caseData[key] = value;
  });
  await caseData.save();
  return caseData;
}

// ================= AUTH ROUTES =================
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password, profile, role } = req.body || {};
    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanName || !cleanEmail || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const { salt, hash } = hashPassword(String(password));
    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash: hash,
      salt,
      role: role || 'user',
      profile: profile || {}
    });

    res.status(201).json({
      token: createToken(),
      user: publicUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: "Server error during signup." });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user || !verifyPassword(String(password), user)) {
      return res.status(401).json({ error: "Wrong email or password." });
    }

    res.json({
      token: createToken(),
      user: publicUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: "Server error during login." });
  }
});

// ================= CHAT ROUTE =================
app.post("/chat", async (req, res) => {
  const { message, system } = req.body;

  const systemPrompt = system || `You are NyaySetu AI, a professional legal assistant for Indian law. Provide accurate, ethical, and comprehensive legal information. Always include appropriate disclaimers that you are not a substitute for qualified legal counsel. Structure responses clearly with legal analysis, applicable laws, recommended actions, and important considerations.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();
    console.log("CHAT RESPONSE:", data);

    if (data.error) {
      return res.status(502).json({ error: data.error.message || "Upstream API Error" });
    }

    res.json({
      reply: data.choices?.[0]?.message?.content || "No response"
    });

  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.status(500).json({ error: "Server error. Try again." });
  }
});


app.post("/generate-doc", async (req, res) => {
  const { formData = "", type = "legal-notice", mode = "body-only", fields = {}, documentTitle = "", date = "" } = req.body || {};

  const docProfiles = {
    "legal-notice": {
      label: "legal notice",
      instructions: "Draft numbered body paragraphs covering facts, cause of action, statutory/legal basis where appropriate, demand, time for compliance, and consequences of non-compliance."
    },
    affidavit: {
      label: "affidavit",
      instructions: "Draft only the numbered statements of fact. Do not draft the title, deponent introduction, verification, notary block, or signature block."
    },
    "rent-agreement": {
      label: "rent agreement",
      instructions: "Draft only the operative clauses: term, rent, security deposit, utilities, maintenance, use, inspection, subletting, termination, handover, damages, dispute resolution, and jurisdiction."
    },
    "consumer-complaint": {
      label: "consumer complaint",
      instructions: "Draft body paragraphs covering facts, deficiency in service/defect, cause of action, jurisdiction, limitation, evidence, and prayer for relief under the Consumer Protection Act, 2019."
    },
    rti: {
      label: "RTI application",
      instructions: "Draft only the request body, listing the information sought clearly and referencing Section 6(1) and transfer under Section 6(3) where relevant."
    },
    "bail-application": {
      label: "bail application",
      instructions: "Draft body paragraphs covering brief facts, custody status if provided, grounds for bail, undertakings, and prayer under the applicable criminal procedure provisions."
    }
  };

  const typeAliases = {
    rent: "rent-agreement",
    consumer: "consumer-complaint",
    bail: "bail-application",
    legal_notice: "legal-notice",
    rent_agreement: "rent-agreement",
    consumer_complaint: "consumer-complaint",
    bail_application: "bail-application"
  };

  const normalizedType = typeAliases[String(type).toLowerCase()] || String(type).toLowerCase();
  const profile = docProfiles[normalizedType] || docProfiles["legal-notice"];
  const fieldsText = String(formData || "").trim() || Object.entries(fields || {})
    .filter(([, value]) => String(value || "").trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const bodyOnly = mode === "body-only";
  const systemPrompt = `
You are a professional Indian legal document drafter.

Task: Draft a ${profile.label}.

STRICT RULES:
- Do not mention NyaySetu, any website, any logo, or that a platform generated this document.
- No markdown, asterisks, hash headings, tables, or decorative separators.
- Use clean formal legal paragraphs with readable spacing.
- Use only details supplied by the user. Do not write undefined, null, [not provided], or placeholder values.
- If an optional detail is missing, omit that clause or phrase naturally.
- Keep the tone professional, realistic, and suitable for review by an advocate or court filing clerk.
${bodyOnly ? "- Return ONLY the body clauses/paragraphs. Do not include title, date, party/address block, subject line, salutation, footer, disclaimer, or signature block." : "- Return the complete document in plain text with title, date, party blocks, subject, body, and signature block."}

Document-specific instructions:
${profile.instructions}

Output only the final document text.
`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Document title: ${documentTitle || profile.label}
Date: ${date || new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}

User-provided details:
${fieldsText}`
          }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(502).json({ error: data.error.message || "Upstream API Error" });
    }

    const documentText = String(data.choices?.[0]?.message?.content || "No response")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .filter(line => !/\b(NyaySetu|nyaysetu\.in|AI Legal Assistant|Generated by)\b/i.test(line))
      .join("\n")
      .trim();

    res.json({
      document: documentText || "No response"
    });

  } catch (err) {
    console.error("GENERATE DOC ERROR:", err);
    res.status(500).json({ error: "Server error while generating document." });
  }
});
// ================= LAWYER CONNECTIVITY =================

app.post("/create-case", async (req, res) => {
  try {
    const {
      problemType,
      summary,
      facts = [],
      documents = [],
      userId,
      location = "",
      language = ""
    } = req.body || {};

    if (!problemType || !summary) {
      return res.status(400).json({ error: "Missing required case fields." });
    }

    const casePayload = {
      problemType,
      summary,
      facts: normalizeList(facts),
      documents: normalizeList(documents),
      location: String(location || "").trim(),
      language: String(language || "").trim(),
      status: "open",
      assignedLawyerId: null
    };

    if (isValidObjectId(userId)) casePayload.userId = userId;

    const newCase = await Case.create(casePayload);

    res.status(201).json(serializeCase(newCase));
  } catch (err) {
    res.status(500).json({ error: "Failed to create case." });
  }
});

app.get("/get-cases/:userId", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.userId)) return res.json([]);
    const userCases = await Case.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(userCases.map(serializeCase));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch cases." });
  }
});

app.get("/case/:caseId", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.caseId)) {
      return res.status(400).json({ error: "Invalid caseId." });
    }

    const caseData = await Case.findById(req.params.caseId).select("-__v");
    if (!caseData) return res.status(404).json({ error: "Case not found." });
    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch case." });
  }
});

app.get("/cases", async (req, res) => {
  try {
    const { lawyerId, reviewStatus } = req.query;
    
    let query = {};
    
    if (reviewStatus) {
      query.reviewStatus = reviewStatus;
    } else {
      // Default behavior for backward compatibility
      query.status = { $in: ["pending_review", "open"] };
    }
    
    if (lawyerId && isValidObjectId(lawyerId)) {
      query.assignedLawyerId = lawyerId;
    }
    
    const cases = await Case.find(query).sort({ createdAt: -1 }).limit(50);
    
    const applications = lawyerId && isValidObjectId(lawyerId)
      ? await Application.find({ lawyerId }).select("caseId status")
      : [];
    const applicationMap = new Map(applications.map(app => [String(app.caseId), app.status]));

    res.json(cases.map(caseData => ({
      ...serializeCase(caseData),
      applicationStatus: applicationMap.get(String(caseData._id)) || null
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch cases." });
  }
});

app.post("/request-lawyer-review", async (req, res) => {
  try {
    const { caseId } = req.body || {};
    const caseData = await updateCaseStatus(caseId, "pending_review", {
      reviewRequestedAt: new Date()
    });
    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to request lawyer review." });
  }
});

app.post("/assign-lawyer", async (req, res) => {
  try {
    const { caseId, lawyerId, applicationId } = req.body || {};
    if (!isValidObjectId(lawyerId)) {
      return res.status(400).json({ error: "Invalid lawyerId." });
    }

    const lawyer = await User.findById(lawyerId);
    if (!lawyer || lawyer.role !== "lawyer") {
      return res.status(403).json({ error: "Assigned user must be a lawyer." });
    }

    const targetCaseId = caseId || (isValidObjectId(applicationId)
      ? (await Application.findById(applicationId))?.caseId
      : null);
    const caseData = await updateCaseStatus(targetCaseId, "assigned", {
      assignedLawyerId: lawyerId,
      assignedAt: new Date()
    });

    await Application.updateMany({ caseId: caseData._id }, { status: "rejected" });
    await Application.findOneAndUpdate(
      { caseId: caseData._id, lawyerId },
      { status: "accepted" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to assign lawyer." });
  }
});

app.post("/approve-case", async (req, res) => {
  try {
    const { caseId, lawyerId, lawyerNotes = "", reviewedDocument = "" } = req.body || {};
    const caseData = await Case.findById(caseId);
    if (!caseData) return res.status(404).json({ error: "Case not found." });
    if (lawyerId && String(caseData.assignedLawyerId || "") !== String(lawyerId)) {
      return res.status(403).json({ error: "Only the assigned lawyer can approve this case." });
    }

    caseData.status = "approved";
    caseData.approvedAt = new Date();
    caseData.lawyerNotes = String(lawyerNotes || "").trim();
    caseData.reviewedDocument = String(reviewedDocument || "").trim();
    await caseData.save();

    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(500).json({ error: "Failed to approve case." });
  }
});

app.post("/complete-payment", async (req, res) => {
  try {
    const { caseId, amount = 999, currency = "INR", reference = "" } = req.body || {};
    const caseData = await updateCaseStatus(caseId, "paid", {
      paidAt: new Date(),
      payment: { amount: Number(amount) || 999, currency, reference }
    });
    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to complete payment." });
  }
});

app.post("/final-delivery", async (req, res) => {
  try {
    const { caseId, finalDocument = "" } = req.body || {};
    const caseData = await updateCaseStatus(caseId, "completed", {
      completedAt: new Date(),
      finalDocument: String(finalDocument || "Your lawyer-approved document is ready for delivery.").trim()
    });
    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to complete final delivery." });
  }
});

app.post("/apply-case", async (req, res) => {
  try {
    const { caseId, lawyerId, role } = req.body || {};

    if (role !== "lawyer") {
      return res.status(403).json({ error: "Only lawyers can apply for cases." });
    }
    if (!caseId || !lawyerId) {
      return res.status(400).json({ error: "Missing caseId or lawyerId." });
    }
    if (!isValidObjectId(caseId) || !isValidObjectId(lawyerId)) {
      return res.status(400).json({ error: "Invalid caseId or lawyerId." });
    }

    const caseData = await Case.findById(caseId);
    if (!caseData) return res.status(404).json({ error: "Case not found." });
    if (!["open", "pending_review"].includes(caseData.status)) {
      return res.status(400).json({ error: "This case is no longer accepting applications." });
    }

    const alreadyApplied = await Application.findOne({ caseId, lawyerId });
    if (alreadyApplied) {
      return res.status(409).json({ error: "You have already applied for this case." });
    }

    const newApp = await Application.create({
      caseId,
      lawyerId,
      status: "pending"
    });

    res.status(201).json({
      id: newApp.id,
      caseId: newApp.caseId,
      lawyerId: newApp.lawyerId,
      status: newApp.status,
      createdAt: newApp.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit application." });
  }
});

app.get("/my-applications/:lawyerId", async (req, res) => {
  try {
    const apps = await Application.find({ lawyerId: req.params.lawyerId })
      .populate({
        path: 'caseId',
        select: 'problemType summary location language status createdAt'
      })
      .sort({ createdAt: -1 });

    const enrichedApps = apps.map(app => ({
      _id: app._id,
      id: app._id,
      caseId: app.caseId?._id || app.caseId,
      lawyerId: app.lawyerId,
      status: app.status,
      createdAt: app.createdAt,
      case: serializeCase(app.caseId)
    }));

    res.json(enrichedApps);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch applications." });
  }
});

app.get("/case-details/:caseId", async (req, res) => {
  try {
    const { lawyerId } = req.query; // Assume lawyerId is passed in query for now

    if (!lawyerId) {
      return res.status(401).json({ error: "Unauthorized access." });
    }

    const lawyer = await User.findById(lawyerId);
    if (!lawyer || lawyer.role !== 'lawyer') {
      return res.status(403).json({ error: "Access denied. Lawyers only." });
    }

    const caseData = await Case.findById(req.params.caseId).populate('userId', 'name email');

    if (!caseData) {
      return res.status(404).json({ error: "Case not found." });
    }

    // Security check: only assigned lawyer can see full details
    if (String(caseData.assignedLawyerId) !== String(lawyerId)) {
      return res.status(403).json({ error: "You are not assigned to this case. User identity is hidden until case is assigned." });
    }

    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch case details." });
  }
});

app.get("/get-lawyers", async (req, res) => {
  try {
    const lawyers = await User.find({ role: "lawyer" }).limit(6).select('name email profile');
    const mapped = lawyers.map(mapLawyerForList);
    const filtered = applyLawyerFilters(mapped, req.query.specialization, req.query.location, req.query.budget);
    res.json(filtered.length ? filtered : (mapped.length ? mapped : getFallbackLawyers()));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch lawyers." });
  }
});

app.get("/lawyers", async (req, res) => {
  try {
    const lawyers = await User.find({ role: "lawyer" }).select('name email profile');
    const mapped = lawyers.map(mapLawyerForList);
    const filtered = applyLawyerFilters(mapped, req.query.specialization, req.query.location, req.query.budget);
    res.json(filtered.length ? filtered : (mapped.length ? mapped : getFallbackLawyers()));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch lawyers." });
  }
});

app.post("/send-case", async (req, res) => {
  try {
    const { caseId, lawyerId } = req.body || {};
    if (!isValidObjectId(caseId) || !lawyerId) {
      return res.status(400).json({ error: "Invalid caseId or lawyerId." });
    }

    const lawyer = await resolveLawyerTarget(lawyerId);
    if (!lawyer || lawyer.role !== "lawyer") {
      return res.status(404).json({ error: "Selected lawyer was not found." });
    }

    const caseData = await updateCaseStatus(caseId, "pending_review", {
      reviewRequestedAt: new Date()
    });

    let application = await Application.findOne({ caseId, lawyerId });
    if (!application) {
      application = await Application.create({ caseId, lawyerId, status: "pending" });
    }

    res.json({
      case: serializeCase(caseData),
      application: {
        id: application.id,
        caseId: application.caseId,
        lawyerId: application.lawyerId,
        status: application.status,
        createdAt: application.createdAt
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to send case." });
  }
});

app.post("/book-consultation", async (req, res) => {
  try {
    const { caseId, lawyerId } = req.body || {};
    if (!isValidObjectId(caseId) || !lawyerId) {
      return res.status(400).json({ error: "Invalid caseId or lawyerId." });
    }

    const lawyer = await resolveLawyerTarget(lawyerId);
    if (!lawyer || lawyer.role !== "lawyer") {
      return res.status(404).json({ error: "Selected lawyer was not found." });
    }

    const caseData = await updateCaseStatus(caseId, "pending_review", {
      reviewRequestedAt: new Date()
    });

    let application = await Application.findOne({ caseId, lawyerId });
    if (!application) {
      application = await Application.create({ caseId, lawyerId, status: "pending" });
    }

    res.json({
      case: serializeCase(caseData),
      application: {
        id: application.id,
        caseId: application.caseId,
        lawyerId: application.lawyerId,
        status: application.status,
        createdAt: application.createdAt,
        type: 'consultation'
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to book consultation." });
  }
});

app.get("/match-lawyers/:caseId", async (req, res) => {
  try {
    const caseData = await Case.findById(req.params.caseId);
    if (!caseData) return res.status(404).json({ error: "Case not found" });

    // Match logic
    const lawyers = await User.find({ role: "lawyer" }).select('name email profile');
    const mapped = lawyers.map(mapLawyerForList);
    const lawyerPool = mapped.length ? mapped : getFallbackLawyers();
    const matched = matchLawyersForCase(lawyerPool, caseData);

    res.json({ case: serializeCase(caseData), lawyers: matched.slice(0, 3) });
  } catch (err) {
    res.status(500).json({ error: "Failed to match lawyers." });
  }
});

// ================= LAWYER REVIEW WORKFLOW ROUTES =================

app.post("/update-review-status", async (req, res) => {
  try {
    const { caseId, reviewStatus, lawyerId } = req.body || {};
    
    if (!isValidObjectId(caseId)) {
      return res.status(400).json({ error: "Invalid caseId." });
    }

    const caseData = await Case.findById(caseId);
    if (!caseData) {
      return res.status(404).json({ error: "Case not found." });
    }

    // Check if lawyer is assigned
    if (lawyerId && String(caseData.assignedLawyerId) !== String(lawyerId)) {
      return res.status(403).json({ error: "Only assigned lawyer can update review status." });
    }

    const validStatuses = ['draft', 'pending_review', 'under_review', 'verified', 'completed'];
    if (!validStatuses.includes(reviewStatus)) {
      return res.status(400).json({ error: "Invalid review status." });
    }

    caseData.reviewStatus = reviewStatus;
    if (reviewStatus === 'verified') {
      caseData.reviewedAt = new Date();
    }

    await caseData.save();
    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to update review status." });
  }
});

app.post("/add-lawyer-notes", async (req, res) => {
  try {
    const { caseId, notes, lawyerId } = req.body || {};
    
    if (!isValidObjectId(caseId)) {
      return res.status(400).json({ error: "Invalid caseId." });
    }

    const caseData = await Case.findById(caseId);
    if (!caseData) {
      return res.status(404).json({ error: "Case not found." });
    }

    // Check if lawyer is assigned
    if (lawyerId && String(caseData.assignedLawyerId) !== String(lawyerId)) {
      return res.status(403).json({ error: "Only assigned lawyer can add notes." });
    }

    caseData.lawyerNotes = String(notes || "").trim();
    await caseData.save();
    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to add lawyer notes." });
  }
});

app.post("/upload-stamped-document", async (req, res) => {
  try {
    const { caseId, finalDocumentUrl, lawyerId } = req.body || {};
    
    if (!isValidObjectId(caseId)) {
      return res.status(400).json({ error: "Invalid caseId." });
    }

    const caseData = await Case.findById(caseId);
    if (!caseData) {
      return res.status(404).json({ error: "Case not found." });
    }

    // Check if lawyer is assigned
    if (lawyerId && String(caseData.assignedLawyerId) !== String(lawyerId)) {
      return res.status(403).json({ error: "Only assigned lawyer can upload stamped document." });
    }

    caseData.finalDocumentUrl = String(finalDocumentUrl || "").trim();
    caseData.reviewStatus = 'completed';
    caseData.completedAt = new Date();
    await caseData.save();
    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to upload stamped document." });
  }
});

app.post("/update-payment-status", async (req, res) => {
  try {
    const { caseId, paymentStatus, amount, currency = 'INR' } = req.body || {};
    
    if (!isValidObjectId(caseId)) {
      return res.status(400).json({ error: "Invalid caseId." });
    }

    const caseData = await Case.findById(caseId);
    if (!caseData) {
      return res.status(404).json({ error: "Case not found." });
    }

    const validPaymentStatuses = ['pending', 'paid', 'failed'];
    if (!validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({ error: "Invalid payment status." });
    }

    caseData.paymentStatus = paymentStatus;
    if (paymentStatus === 'paid') {
      caseData.payment = {
        amount: Number(amount) || caseData.payment?.amount || 0,
        currency,
        reference: caseData.payment?.reference || ''
      };
      caseData.paidAt = new Date();
    }

    await caseData.save();
    res.json(serializeCase(caseData));
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to update payment status." });
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
