/**
 * Generate JWKS (JSON Web Key Set) from our RSA private key.
 * The output file can be hosted at a public URL for Epic to fetch.
 * 
 * Usage: node scripts/generate-jwks.js
 */
const { importPKCS8, exportJWK } = require('jose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function generateJWKS() {
  const privateKeyPem = fs.readFileSync(
    path.join(__dirname, '..', 'keys', 'privatekey.pem'),
    'utf8'
  );

  const privateKey = await importPKCS8(privateKeyPem, 'RS384');
  const jwk = await exportJWK(privateKey);

  // Only include the public key components (no private key material)
  const publicJwk = {
    kty: jwk.kty,
    n: jwk.n,
    e: jwk.e,
    kid: crypto.randomUUID(),
    use: 'sig',
    alg: 'RS384',
  };

  const jwks = {
    keys: [publicJwk],
  };

  // Write to .well-known directory for hosting
  const outputDir = path.join(__dirname, '..', '.well-known');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'jwks.json');
  fs.writeFileSync(outputPath, JSON.stringify(jwks, null, 2));

  console.log('JWKS written to:', outputPath);
  console.log('Key ID (kid):', publicJwk.kid);
  console.log('\nJWKS content:');
  console.log(JSON.stringify(jwks, null, 2));
  console.log('\n--- Next Steps ---');
  console.log('1. Host this file at a public HTTPS URL');
  console.log('2. Update your Epic app\'s Non-Production JWK Set URL to point to it');
  console.log('3. Run: node scripts/test-epic-sandbox.js');
}

generateJWKS().catch(console.error);
