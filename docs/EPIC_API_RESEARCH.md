# Epic Systems — API & Integration Research
## Investigation & Learning Phase

---

# 1. What is Epic?

Epic Systems is the **largest EHR (Electronic Health Record) vendor** in the world, used by major hospital systems and health organizations. Their platform is called **Epic** (with the clinician-facing UI called **Hyperspace** and the patient portal called **MyChart**).

For our ED Risk Stratification Platform, Epic is the primary EHR we'll integrate with to pull:
- Patient demographics
- Lab results (WBC, Lactate, CRP, etc.)
- Vital signs (HR, BP, SpO₂, Temp)
- Medical history / Problem lists
- Encounter data (ED visits)
- Conditions / Diagnoses

---

# 2. Epic's API Ecosystem Overview

## 2.1 Architecture Model

Epic uses a **federated model**:
- Every hospital/health system runs **their own independent Epic instance**
- There is **no central Epic endpoint** — each customer has their own servers
- Each customer decides which apps can connect
- Your app connects **directly to each hospital's Interconnect server**

This means:
- We need to establish connections with **each hospital individually**
- Each hospital has its own FHIR base URL (e.g., `https://hospital.org/interconnect/api/FHIR/R4/`)
- Hospitals control which APIs your app can access

## 2.2 FHIR Standard

Epic's REST API is built on **HL7 FHIR (Fast Healthcare Interoperability Resources)**:
- Current primary version: **FHIR R4** (recommended)
- Also supports: STU3, DSTU2 (legacy)
- Base standard: https://hl7.org/fhir/

Epic is a member of:
- **Argonaut Project** — accelerating FHIR adoption
- **Da Vinci Project** — payer/provider interoperability
- Supports **USCDI** (US Core Data for Interoperability) data classes

## 2.3 Scale

- **8.65 billion** annual patient records exchanged
- **252 billion** annual web service transactions using Epic's public APIs
- **2,599** live apps using open.epic web services
- **750+ no-cost APIs and interfaces**

---

# 3. Key FHIR Resources for Our ED Platform

These are the Epic FHIR R4 resources directly relevant to our risk stratification system:

| Resource | What We Need It For | Operations |
|---|---|---|
| **Patient (Demographics)** | Age, sex, identifiers | Read, Search, $match |
| **Encounter (Patient Chart)** | ED visit context, admission info | Read, Search |
| **Observation (Vital Signs)** | HR, BP, SpO₂, Temperature | Read, Search, Create |
| **Observation (Labs)** | WBC, Lactate, CRP, TRAIL, IP-10 | Read, Search |
| **Condition (Problems)** | Active problem list | Read, Search, Create |
| **Condition (Encounter Diagnosis)** | ED diagnoses | Read, Search |
| **Condition (Medical History)** | Past medical history | Read, Search |
| **DiagnosticReport (Results)** | Lab report bundles | Read, Search |
| **AllergyIntolerance** | Allergy data | Read, Search |
| **MedicationRequest / MedicationOrder** | Current medications | Read, Search |
| **Observation (Social History)** | Smoking, alcohol use, etc. | Read, Search |
| **Flag (Patient FYI)** | Patient alerts/flags | Read, Search |
| **List (Patient List)** | ED patient tracking boards | Read, Search |
| **Observation (Assessments)** | Clinical assessments/scores | Read, Search |

### Example FHIR Queries

```
# Get patient demographics
GET /api/FHIR/R4/Patient/{id}

# Search for vitals for a patient
GET /api/FHIR/R4/Observation?patient={id}&category=vital-signs

# Search for lab results
GET /api/FHIR/R4/Observation?patient={id}&category=laboratory

# Get active conditions
GET /api/FHIR/R4/Condition?patient={id}&category=problem-list-item

# Get encounters
GET /api/FHIR/R4/Encounter?patient={id}&class=EMER

# Get diagnostic reports
GET /api/FHIR/R4/DiagnosticReport?patient={id}&category=LAB
```

---

# 4. Authentication & Authorization

Epic supports **OAuth 2.0** with multiple launch patterns. The choice depends on how our app is deployed.

## 4.1 Three Launch Models

### A) EHR Launch (SMART on FHIR) — Embedded in Epic
- App is **launched from within Hyperspace** (Epic's clinician UI)
- Epic passes a `launch` token and `iss` (FHIR server URL)
- App exchanges launch token → authorization code → access token
- **Best for**: Dashboard embedded in the clinician's workflow
- Patient and encounter context come for free from the EHR session

**Flow:**
```
1. Epic launches your app URL with ?launch={token}&iss={fhir_url}
2. App calls GET {iss}/metadata to discover authorize/token endpoints
3. App redirects to authorize endpoint with launch token
4. Epic returns authorization code to your redirect_uri
5. App POSTs code to token endpoint → receives access_token
6. App uses access_token in Authorization: Bearer header for FHIR calls
```

### B) Standalone Launch — App Opens Independently
- App launches **outside** of an EHR session (e.g., separate browser tab)
- User authenticates directly with Epic's login
- App must request patient context explicitly
- **Best for**: Standalone dashboard accessed outside Hyperspace

### C) Backend Services (Client Credentials) — Server-to-Server
- No user interaction, no UI
- App authenticates with a **signed JWT** (JSON Web Token)
- Uses `client_credentials` grant type
- **Best for**: Our data ingestion pipeline — scheduled polling of patient data
- Requires a JWK Set URL hosting your public key

**Flow:**
```
1. Generate RSA key pair (min 2048-bit)
2. Create JWT: iss=client_id, sub=client_id, aud=token_endpoint, exp=now+5min
3. POST to token endpoint:
   grant_type=client_credentials
   client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
   client_assertion={signed_jwt}
4. Receive access_token (typically valid ~3600 seconds)
5. Use access_token for FHIR API calls
```

## 4.2 Key Auth Details

| Parameter | Value |
|---|---|
| Protocol | OAuth 2.0 |
| Token type | Bearer |
| Token format | May be JWT (customer-configurable) |
| Access token lifetime | Typically ~3240-3600 seconds |
| PKCE support | Yes (S256 only, since August 2019) |
| OpenID Connect | Supported (openid + fhirUser scopes) |
| SMART scopes v1 | `Patient.read`, `Observation.read`, etc. |
| SMART scopes v2 | `patient/Observation.rs` (CRUDS syntax) |

## 4.3 JWT Signing for Backend Services

```bash
# Generate private key
openssl genrsa -out privatekey.pem 2048

# Export public key as X.509 certificate
openssl req -new -x509 -key privatekey.pem -out publickey509.pem -subj '/CN=myapp'
```

Or on Windows PowerShell:
```powershell
New-SelfSignedCertificate -Subject "EDRiskApp"
```

**Important (May 2026 deadline):** All backend OAuth apps must use a **JWK Set URL** to host public keys — static key uploads are being deprecated.

---

# 5. Developer Onboarding & Sandbox

## 5.1 Getting Started

1. **Sign up** at https://fhir.epic.com/ (free)
2. **Register your app** at https://fhir.epic.com/Developer/Apps
3. **Choose app type**: Backend Systems + Use OAuth 2.0
4. **Select APIs** your app needs (only request what you'll actually use)
5. **Receive client IDs**: One for production, one for non-production/sandbox

## 5.2 Sandbox Testing

- **Sandbox base URL**: `https://fhir.epic.com/interconnect-fhir-oauth/`
- Test against **example patient data** (not real PHI)
- No Epic customer relationship needed for sandbox testing
- "Try It" feature available on API spec pages for no-code testing
- Test patients and endpoints documented at: https://fhir.epic.com/Documentation?docId=testpatients

## 5.3 Going Live with a Hospital

1. Mark your app "ready for production" on Epic on FHIR
2. Hospital customer **requests your client ID** to be synced to their environment
3. You **approve the request** and enable keys for their implementation
4. Hospital's ECSA (Epic Client Systems Administrator) maps your client ID to an audit user
5. Test in hospital's non-production environment
6. Go live in production

---

# 6. Architecture Implications for Our Platform

## 6.1 Recommended Integration Pattern

For the ED Risk Stratification Platform, we'll likely need **two integration patterns**:

```
┌─────────────────────────────────────────────────┐
│                 ED Risk Platform                │
│                                                 │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ Backend      │    │ SMART on FHIR        │   │
│  │ Service      │    │ Dashboard            │   │
│  │              │    │                      │   │
│  │ • Polls data │    │ • Launched from       │   │
│  │ • Ingests    │    │   Hyperspace          │   │
│  │   labs/vitals│    │ • Shows risk scores   │   │
│  │ • Runs       │    │ • Patient detail view │   │
│  │   scoring    │    │                      │   │
│  │              │    │ Auth: EHR Launch      │   │
│  │ Auth: Backend│    │ (SMART on FHIR)       │   │
│  │ OAuth 2.0    │    │                      │   │
│  └──────┬───────┘    └──────────┬───────────┘   │
│         │                       │               │
└─────────┼───────────────────────┼───────────────┘
          │                       │
          ▼                       ▼
   ┌──────────────────────────────────────┐
   │    Hospital's Epic Interconnect      │
   │    (FHIR R4 Server)                  │
   │                                      │
   │    /api/FHIR/R4/Patient              │
   │    /api/FHIR/R4/Observation          │
   │    /api/FHIR/R4/Encounter            │
   │    /api/FHIR/R4/Condition            │
   │    /api/FHIR/R4/DiagnosticReport     │
   │    ...                               │
   └──────────────────────────────────────┘
```

### Pattern A: Backend Service (Data Ingestion)
- **Purpose**: Periodically fetch new patients, labs, vitals from Epic
- **Auth**: Backend OAuth 2.0 (JWT-based, no user interaction)
- **Use case**: Populate our internal database, run scoring engine

### Pattern B: SMART on FHIR App (Clinician Dashboard)
- **Purpose**: ED physician views risk dashboard embedded in Hyperspace
- **Auth**: EHR Launch (SMART on FHIR)
- **Use case**: Real-time risk visualization during patient care

## 6.2 Alternative: HL7v2 Interfaces for Real-Time Data

For real-time data (new lab results, new vitals), Epic also supports **HL7v2 interfaces**:
- **ADT (Admit/Discharge/Transfer)** — patient movement events
- **ORU (Observation Result)** — lab/vitals results as they come in
- These push data in real-time vs. FHIR polling

A hybrid approach is common:
- **HL7v2 messages** for real-time event-driven data ingestion
- **FHIR APIs** for on-demand data queries and the clinician-facing app

---

# 7. Security & Compliance Requirements

Epic enforces strict **App Developer Guidelines** (9 categories):

| # | Category | Key Requirements |
|---|---|---|
| 1 | **Safety** | Usability standards, patient identity verification, accurate data display |
| 2 | **Security** | AES-128+ encryption at rest, TLS 1.2+ in transit, OWASP Top 10, OAuth 2.0 |
| 3 | **Privacy** | Data use questionnaire, consent management, no selling data |
| 4 | **Reliability** | No crashes, predictable behavior, logging, <1% downtime |
| 5 | **Scalability** | <1% ODB system resources during peak, <1.5s initial load |
| 6 | **Data Integrity** | Backward compatibility, use only published Epic methods |
| 7 | **System Integrity** | Don't imitate Epic UI, thorough non-production testing |
| 8 | **Transparency** | Accurate representation of features, costs, Epic relationship |
| 9 | **IP** | Don't copy Epic source code/UI, protect third-party content |

### Critical Security Points for Our App:
- All data at rest encrypted with **AES-128 or higher**
- All data in transit secured with **TLS 1.2+**
- Request only the **minimum APIs/scopes needed**
- PHI-safe protections even in **non-production** environments
- Address **OWASP Top 10** vulnerabilities
- Validate/escape all user input before passing to APIs
- Non-production connections must meet **HIPAA** data handling requirements

---

# 8. Data Mapping: MeMed BV Integration with Epic

Our platform combines Epic EHR data with MeMed BV test results. Here's how data maps:

| Our Platform Data | Epic FHIR Resource | FHIR Path |
|---|---|---|
| Patient Name | Patient | `Patient.name` |
| Age / DOB | Patient | `Patient.birthDate` |
| Sex | Patient | `Patient.gender` |
| MRN | Patient | `Patient.identifier` (MRN type) |
| Heart Rate | Observation (Vital Signs) | LOINC: 8867-4 |
| Blood Pressure | Observation (Vital Signs) | LOINC: 85354-9 |
| SpO₂ | Observation (Vital Signs) | LOINC: 2708-6 |
| Temperature | Observation (Vital Signs) | LOINC: 8310-5 |
| WBC | Observation (Labs) | LOINC: 6690-2 |
| Lactate | Observation (Labs) | LOINC: 2524-7 |
| CRP | Observation (Labs) | LOINC: 1988-5 |
| TRAIL / IP-10 | Observation (Labs) | Custom LOINC or local codes |
| Problem List | Condition (Problems) | `Condition.code` |
| ED Encounter | Encounter | `Encounter.class` = EMER |
| ED Arrival Time | Encounter | `Encounter.period.start` |
| Medications | MedicationRequest | `MedicationRequest.medicationCodeableConcept` |

> **Note**: MeMed BV results (TRAIL, IP-10) may need custom observation codes if not yet assigned standard LOINC codes. These would be filed as lab results either through the LIS interface or via FHIR Observation.Create.

---

# 9. Next Steps

## Immediate Actions
- [ ] Create an account on https://fhir.epic.com/
- [ ] Register a test app (Backend Systems + SMART on FHIR)
- [ ] Explore the sandbox with test patients
- [ ] Test key API calls: Patient, Observation (Vitals/Labs), Encounter, Condition

## Design Decisions Needed
- [ ] Backend polling frequency vs. HL7v2 real-time interfaces
- [ ] Single app or separate client IDs for backend vs. dashboard
- [ ] FHIR version: R4 (recommended) vs. STU3
- [ ] Scope of data: What's minimum viable for Pilot mode?
- [ ] Hosting model: Cloud vs. on-prem (affects key management)

## Further Research
- [ ] Epic's Bulk Data API for batch patient data export
- [ ] CDS Hooks for clinical decision support integration
- [ ] Epic's Showroom/Connection Hub for app listing
- [ ] HL7v2 ADT/ORU interface specs for real-time data feeds
- [ ] TEFCA/Carequality for cross-network data exchange

---

# 10. Key Links

| Resource | URL |
|---|---|
| Epic on FHIR (API docs) | https://fhir.epic.com/ |
| Open.Epic (Developer portal) | https://open.epic.com/ |
| App Registration | https://fhir.epic.com/Developer/Apps |
| OAuth 2.0 Spec | https://fhir.epic.com/Documentation?docId=oauth2 |
| Developer Guide | https://open.epic.com/DeveloperResources |
| Test Patients | https://fhir.epic.com/Documentation?docId=testpatients |
| Sandbox Base URL | `https://fhir.epic.com/interconnect-fhir-oauth/` |
| Data Sharing Playbooks | https://open.epic.com/Playbooks |
| Developer Guidelines | https://fhir.epic.com/Documentation?docId=developerguidelines |
| FHIR R4 Standard | https://hl7.org/fhir/R4/ |
