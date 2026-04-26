# ED Risk Stratification Platform  
## Engineering Design Brief

---

# 1. Project Overview

We are starting a new project to design and implement an **Emergency Department (ED) patient risk stratification platform**.

The system will:

- Integrate with hospital EHR / LIS systems
- Ingest clinical data (labs, vitals, demographics, medical history)
- Incorporate MeMed BV results (TRAIL, IP-10, CRP)
- Compute a risk score using a versioned scoring engine
- Present results in a dashboard and patient detail view
- Support both **Observational (Pilot)** and **Clinical (Regulated)** modes

This is a greenfield system design.

The goal is to build an architecture that is:

- Auditable
- Versioned
- Deterministic
- Secure
- Deployment-flexible (cloud or on-prem)
- Regulatory-ready

---

# 2. Product Vision (From Kickoff)

## 2.1 Patient Risk Dashboard

A live ED dashboard showing:

- Patient list
- Age / Sex
- BV Score
- Risk Level (High / Medium / Low)
- Key alerts
- Waiting time
- Filters (All Patients, High Risk, Last 2h)
- Summary counters (High Risk count, Waiting >1h, Recent BV tests)

⚠ In Pilot mode:
- No ranking by risk
- No aggressive color coding
- No clinical nudging

---

## 2.2 Patient Detail View

For a selected patient:

- Overall Risk Level
- BV Score
- Contributing risk factors (explainability)
- Vitals (HR, BP, SpO₂)
- Labs (Lactate, WBC, etc.)
- Medical history
- Timestamped data lineage

The score must always be explainable.

---

## 2.3 System Architecture (Conceptual)

Components include:

- Hospital EHR / LIS
- Data Integration Layer (HL7 / FHIR)
- Risk Scoring Engine
- Authentication & SSO
- Secure Access (VPN / HTTPS)
- Audit Logging
- Authorized ED Physician access

---

# 3. Regulatory Constraint – Two Operating Modes

## 3.1 Pilot (Observational) Mode

- System must NOT influence clinical decisions.
- No prioritization based on risk.
- Scores may be computed and stored.
- UI limited to neutral data presentation.
- All computations must be reproducible.
- Full dataset versioning required.

## 3.2 Clinical Mode (Post-Regulatory Clearance)

- Risk-based sorting
- Alerting
- Triage support
- Full dashboard features enabled

The architecture must support strict separation between modes via configuration.

---

# 4. Functional Requirements

## 4.1 Data Integration

- Support HL7v2 ingestion
- Support FHIR ingestion (if available)
- Store raw inbound messages (immutable)
- Normalize to canonical schema
- Track source system and message IDs
- Maintain full traceability

---

## 4.2 Canonical Data Model (Core Entities)

- Patient
- Encounter
- Observation (vitals, labs)
- DeviceResult (MeMed BV)
- ScoreRecord
- ModelVersion
- FeatureVectorSnapshot
- AuditLog

Every ScoreRecord must reference:

- Model version
- Feature schema version
- Data snapshot ID
- Explanation payload
- Computation timestamp

---

## 4.3 Risk Scoring Engine

Exposed via REST API:

POST /score

Request:
- patient_id
- encounter_id
- optional feature bundle
- optional model_version

Response:
- score (numeric)
- risk_bucket (if enabled)
- explanation (top contributing features)
- model_version
- feature_schema_version
- data_snapshot_id

Requirements:

- Deterministic computation
- Versioned models
- Replay capability
- Audit logging
- Drift monitoring (future phase)

---

## 4.4 Security & Access Control

- SSO (OIDC or SAML)
- Role-based access control (RBAC)
- Audit logs for:
  - Data access
  - Score computation
  - Score viewing
- Secure transport (TLS)
- Tenant isolation (per hospital site)

---

## 4.5 Analytics & Dataset Export

- Versioned analysis datasets
- Immutable exports
- Full lineage tracking
- Regulatory audit support

---

# 5. Non-Functional Requirements

- High availability
- Clear separation of concerns
- Event-driven architecture preferred
- Observability:
  - Structured logs
  - Metrics
  - Monitoring
- Deterministic builds
- Containerized deployment
- CI/CD compatible
- Regulatory-ready design

---

# 6. Suggested High-Level Architecture Direction

## 6.1 Integration Layer

- HL7 listener
- FHIR client
- Mapping & normalization service
- Raw message store (immutable object storage)
- Normalized database (PostgreSQL)

---

## 6.2 Core Services

- Scoring Service
- Model Registry Service
- Dataset Export Service
- Audit Service
- Mode Configuration Service

---

## 6.3 API Layer

- Backend-for-Frontend (BFF)
- Web UI (React or similar)

---

## 6.4 Deployment Targets

Support:

- Cloud-first
- Fully on-prem hospital deployment
- Containerized (Kubernetes preferred)
- Air-gapped deployment possible

---

# 7. Engineering Design Goals

- Separation of ingestion from scoring
- Immutable raw data storage
- Deterministic scoring
- Version everything
- Avoid UI ↔ scoring coupling
- Enforce safe Pilot Mode
- Design for auditability first
- Make misuse difficult

---

# 8. What We Want to Design Next

Please help define:

1. System architecture diagram (text form)
2. Service boundaries
3. Database schema (initial draft)
4. API contracts (OpenAPI style)
5. Event model (if event-driven)
6. Model versioning strategy
7. Traceability & lineage design
8. Security architecture
9. Pilot vs Clinical mode implementation
10. Phased implementation roadmap

Assume:
- Greenfield
- Hospital-grade reliability
- Regulatory scrutiny
- Security-first mindset

Start with architecture and service decomposition.
Then go deeper into schemas and APIs.