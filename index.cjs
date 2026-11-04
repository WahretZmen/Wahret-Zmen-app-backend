// Run from the backend directory: node path/to/patch-index.cjs
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(process.cwd(), 'index.js');
const original = fs.readFileSync(file, 'utf8');
const mount = /app\.use\(\s*["']\/api\/ai["']\s*,\s*(amHssinSessionRoute|amHssinRoute)\s*\);/g;
const found = [...original.matchAll(mount)];
if (found.length !== 2 || found[0][1] !== 'amHssinSessionRoute' || found[1][1] !== 'amHssinRoute') {
  throw new Error('Expected two AI mounts in legacy-first order. No changes made.');
}
let count = 0;
const updated = original.replace(mount, (match, name) => {
  count++;
  return match.replace(name, count === 1 ? 'amHssinRoute' : 'amHssinSessionRoute');
});
fs.copyFileSync(file, file + '.before-am-hssin-fix.bak');
fs.writeFileSync(file, updated);
console.log('Updated AI route precedence; backup saved.');
