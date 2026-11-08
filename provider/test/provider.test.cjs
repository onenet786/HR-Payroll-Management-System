// node --test provider/test/provider.test.cjs  (pure logic; needs no database)
process.env.BASE_DOMAIN = 'binishaqsoft.com';
process.env.SERVER_IP = '203.0.113.10';
process.env.PROVIDER_NAMESERVERS = 'ns1.onenet.test, ns2.onenet.test';
const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('../lib/dns.cjs');

test('domain input is normalised from what people paste', () => {
  assert.equal(dns.normalizeDomain('https://HR.Acme.com/login?x=1'), 'hr.acme.com');
  assert.equal(dns.normalizeDomain('hr.acme.com.'), 'hr.acme.com');
  assert.equal(dns.normalizeDomain('hr.acme.com:443'), 'hr.acme.com');
  assert.throws(() => dns.normalizeDomain('not a domain'));
  assert.throws(() => dns.normalizeDomain('-bad.com'));
});

test('registrable domain handles Pakistani and other multi-part suffixes', () => {
  assert.equal(dns.registrableDomain('hr.acme.com'), 'acme.com');
  assert.equal(dns.registrableDomain('acme.com.pk'), 'acme.com.pk');
  assert.equal(dns.registrableDomain('hr.acme.com.pk'), 'acme.com.pk');
  assert.equal(dns.registrableDomain('portal.acme.co.uk'), 'acme.co.uk');
  assert.equal(dns.registrableDomain('acme.pk'), 'acme.pk');
});

test('expected DNS records for every domain type', () => {
  assert.deepEqual(dns.expectedRecords('hr.acme.com', 'subdomain', 'acme').map(r => [r.type, r.host, r.value]), [['CNAME', 'hr.acme.com', 'acme.binishaqsoft.com']]);
  const apex = dns.expectedRecords('acme.com', 'apex', 'acme');
  assert.deepEqual(apex.map(r => [r.type, r.host, r.value]), [['A', 'acme.com', '203.0.113.10'], ['CNAME', 'www.acme.com', 'acme.com']]);
  const ns = dns.expectedRecords('acmehr.com', 'nameservers', 'acme');
  assert.deepEqual(ns.filter(r => r.who === 'client').map(r => r.value), ['ns1.onenet.test', 'ns2.onenet.test']);
  assert.ok(ns.filter(r => r.who === 'provider').some(r => r.type === 'A'));
});

test('platform names are reserved and recognised', async () => {
  assert.equal((await dns.classifyDomain('acme.binishaqsoft.com', 'acme')).kind, 'platform');
  await assert.rejects(dns.classifyDomain('other.binishaqsoft.com', 'acme'), /reserved/);
  await assert.rejects(dns.classifyDomain('binishaqsoft.com', 'acme'), /reserved/);
});
