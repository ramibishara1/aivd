/**
 * Test script: Authenticate with Epic Sandbox using Backend OAuth 2.0
 * and make a FHIR API call to fetch a test patient.
 * 
 * Usage: node scripts/test-epic-sandbox.js
 * 
 * Prerequisites:
 *   1. Run: node scripts/generate-jwks.js
 *   2. Host the .well-known/jwks.json at a public HTTPS URL
 *   3. Update your Epic app's JWK Set URL
 */
const { importPKCS8, SignJWT } = require('jose');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const CONFIG = {
  // Your Epic Non-Production Client ID
  clientId: '40d1574e-dba0-46c7-81c9-90939f9c2c6e',

  // Epic Sandbox endpoints
  tokenEndpoint: 'https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token',
  fhirBaseUrl: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',

  // Path to your private key
  privateKeyPath: path.join(__dirname, '..', 'keys', 'privatekey.pem'),
};

async function getAccessToken() {
  console.log('Step 1: Creating signed JWT...');
  
  const privateKeyPem = fs.readFileSync(CONFIG.privateKeyPath, 'utf8');
  const privateKey = await importPKCS8(privateKeyPem, 'RS384');

  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS384', typ: 'JWT' })
    .setIssuer(CONFIG.clientId)
    .setSubject(CONFIG.clientId)
    .setAudience(CONFIG.tokenEndpoint)
    .setJti(uuidv4())
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 300) // 5 minutes
    .sign(privateKey);

  console.log('  JWT created (first 50 chars):', jwt.substring(0, 50) + '...');

  console.log('\nStep 2: Requesting access token from Epic...');
  
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: jwt,
  });

  const response = await fetch(CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error('  Token request failed:', response.status);
    console.error('  Response:', JSON.stringify(data, null, 2));
    throw new Error(`Token request failed: ${response.status}`);
  }

  console.log('  Access token received!');
  console.log('  Token type:', data.token_type);
  console.log('  Expires in:', data.expires_in, 'seconds');
  console.log('  Scope:', data.scope);

  return data.access_token;
}

async function queryFHIR(accessToken, resourcePath) {
  const url = `${CONFIG.fhirBaseUrl}/${resourcePath}`;
  console.log(`\nQuerying: ${url}`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/fhir+json',
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('  FHIR query failed:', response.status);
    console.error('  Response:', JSON.stringify(data, null, 2));
    return null;
  }

  return data;
}

async function main() {
  console.log('=== Epic Sandbox Backend OAuth 2.0 Test ===\n');
  console.log('Client ID:', CONFIG.clientId);
  console.log('Token Endpoint:', CONFIG.tokenEndpoint);
  console.log('FHIR Base URL:', CONFIG.fhirBaseUrl);
  console.log('');

  try {
    // Step 1-2: Get access token
    const accessToken = await getAccessToken();

    // Step 3: Query a test patient
    // Epic sandbox test patient: Jason Argonaut (common FHIR test patient)
    console.log('\n--- Test Queries ---\n');

    // Search for patients named "Argonaut"
    console.log('=== Patient Search ===');
    const patients = await queryFHIR(accessToken, 'Patient?family=Argonaut&_count=5');
    if (patients && patients.entry) {
      console.log(`  Found ${patients.entry.length} patient(s)`);
      patients.entry.forEach((entry, i) => {
        const p = entry.resource;
        const name = p.name?.[0];
        console.log(`  ${i + 1}. ${name?.given?.join(' ')} ${name?.family} | DOB: ${p.birthDate} | Gender: ${p.gender} | ID: ${p.id}`);
      });

      // Get vitals for the first patient
      const patientId = patients.entry[0].resource.id;
      
      console.log(`\n=== Vital Signs for Patient ${patientId} ===`);
      const vitals = await queryFHIR(accessToken, `Observation?patient=${patientId}&category=vital-signs&_count=5&_sort=-date`);
      if (vitals && vitals.entry) {
        console.log(`  Found ${vitals.total || vitals.entry.length} vital sign(s)`);
        vitals.entry.forEach((entry, i) => {
          const obs = entry.resource;
          const code = obs.code?.coding?.[0]?.display || obs.code?.text;
          const value = obs.valueQuantity
            ? `${obs.valueQuantity.value} ${obs.valueQuantity.unit}`
            : obs.component
            ? obs.component.map(c => `${c.code?.coding?.[0]?.display}: ${c.valueQuantity?.value} ${c.valueQuantity?.unit}`).join(', ')
            : 'N/A';
          console.log(`  ${i + 1}. ${code}: ${value} (${obs.effectiveDateTime || 'unknown date'})`);
        });
      } else {
        console.log('  No vitals found (or different search needed)');
      }

      console.log(`\n=== Lab Results for Patient ${patientId} ===`);
      const labs = await queryFHIR(accessToken, `Observation?patient=${patientId}&category=laboratory&_count=5&_sort=-date`);
      if (labs && labs.entry) {
        console.log(`  Found ${labs.total || labs.entry.length} lab result(s)`);
        labs.entry.forEach((entry, i) => {
          const obs = entry.resource;
          const code = obs.code?.coding?.[0]?.display || obs.code?.text;
          const value = obs.valueQuantity
            ? `${obs.valueQuantity.value} ${obs.valueQuantity.unit}`
            : obs.valueString || 'N/A';
          console.log(`  ${i + 1}. ${code}: ${value} (${obs.effectiveDateTime || 'unknown date'})`);
        });
      } else {
        console.log('  No lab results found (or different search needed)');
      }

      console.log(`\n=== Conditions for Patient ${patientId} ===`);
      const conditions = await queryFHIR(accessToken, `Condition?patient=${patientId}&_count=5`);
      if (conditions && conditions.entry) {
        console.log(`  Found ${conditions.total || conditions.entry.length} condition(s)`);
        conditions.entry.forEach((entry, i) => {
          const cond = entry.resource;
          const code = cond.code?.coding?.[0]?.display || cond.code?.text;
          console.log(`  ${i + 1}. ${code} | Status: ${cond.clinicalStatus?.coding?.[0]?.code || 'unknown'}`);
        });
      } else {
        console.log('  No conditions found');
      }
    } else {
      console.log('  No patients found with name "Argonaut"');
      console.log('  Trying a general patient search...');
      const anyPatients = await queryFHIR(accessToken, 'Patient?_count=3');
      if (anyPatients) {
        console.log('  Response:', JSON.stringify(anyPatients, null, 2).substring(0, 500));
      }
    }

    console.log('\n=== Test Complete ===');
    console.log('Backend OAuth 2.0 authentication and FHIR queries working!');
  } catch (error) {
    console.error('\nError:', error.message);
    if (error.message.includes('Token request failed')) {
      console.log('\nTroubleshooting:');
      console.log('1. Make sure your JWK Set URL is publicly accessible and serves the correct JWKS');
      console.log('2. The URL must be HTTPS');
      console.log('3. Go to https://fhir.epic.com/Developer/Apps and verify your app settings');
      console.log('4. The Non-Production JWK Set URL must point to YOUR server hosting the jwks.json');
    }
  }
}

main();
