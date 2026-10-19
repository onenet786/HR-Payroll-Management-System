import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EDITION_FEATURE_INFO, EDITION_FEATURE_KEYS, EDITION_PRESETS, FULL_EDITION, editionEmployee, editionStatConfig, resolveEdition } from './edition';
import { DEFAULT_EMPLOYEES, DEFAULT_STATUTORY_CONFIG } from './defaults';

const serverEdition = createRequire(import.meta.url)('../../server/edition.cjs');

test('client and server agree on the feature keys and presets', () => {
  assert.deepEqual([...EDITION_FEATURE_KEYS], [...serverEdition.EDITION_FEATURE_KEYS]);
  assert.deepEqual(EDITION_PRESETS.full, { ...serverEdition.EDITION_PRESETS.full });
  assert.deepEqual(EDITION_PRESETS.lite, { ...serverEdition.EDITION_PRESETS.lite });
  for (const key of EDITION_FEATURE_KEYS) assert.ok(EDITION_FEATURE_INFO[key].label, `${key} is described for the vendor console`);
});

test('the full edition switches everything on, so existing installations keep every rule', () => {
  assert.equal(FULL_EDITION.id, 'full');
  assert.ok(EDITION_FEATURE_KEYS.every(key => FULL_EDITION.features[key] === true));
  assert.deepEqual(resolveEdition(undefined), FULL_EDITION);
  assert.deepEqual(resolveEdition({ id: 'premium' }).features, FULL_EDITION.features);
});

test('the lite edition keeps only what a small shop needs', () => {
  const lite = resolveEdition({ id: 'lite' });
  assert.equal(lite.features.incomeTax, false);
  assert.equal(lite.features.eobi, false);
  assert.equal(lite.features.socialSecurity, false);
  assert.equal(lite.features.makerChecker, false);
  assert.equal(lite.features.bankPayroll, false);
  assert.equal(lite.features.loans, true);
  const customized = resolveEdition({ id: 'lite', features: { eobi: true, incomeTax: 'yes' } });
  assert.equal(customized.features.eobi, true, 'the vendor can switch a single feature back on');
  assert.equal(customized.features.incomeTax, false, 'only booleans count');
});

test('payroll inputs under the lite edition carry no statutory deductions', () => {
  const lite = resolveEdition({ id: 'lite' }).features;
  const employee = { ...DEFAULT_EMPLOYEES[0], fbrEnabled: true, eobiEnabled: true, providentFundOptIn: true };
  const adjusted = editionEmployee(lite, employee);
  assert.equal(adjusted.fbrEnabled, false);
  assert.equal(adjusted.eobiEnabled, false);
  assert.equal(adjusted.providentFundOptIn, false);
  assert.equal(employee.fbrEnabled, true, 'the saved record is untouched');
  const config = editionStatConfig(lite, DEFAULT_STATUTORY_CONFIG);
  assert.equal(config.eobiEmployeeRate, 0);
  assert.equal(config.pessiEmployerRate, 0);
  assert.ok(Object.values(config.provincialSocialSecurityRates || {}).every(rate => rate === 0));
  assert.equal(editionEmployee(FULL_EDITION.features, employee), employee, 'the full edition changes nothing');
  assert.equal(editionStatConfig(FULL_EDITION.features, DEFAULT_STATUTORY_CONFIG), DEFAULT_STATUTORY_CONFIG);
});
