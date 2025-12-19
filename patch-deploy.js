import fs from 'fs';
import path from 'path';

// --- PATCH package.json ---
const pkgPath = path.join(process.cwd(), 'package.json');
const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(pkgRaw);

// Rebuild package.json with homepage after name
const newPkg = {};
Object.entries(pkg).forEach(([key, value]) => {
  newPkg[key] = value;
  if (key === 'name') {
    newPkg['homepage'] = "https://mhopkinsinc.github.io/Enforcer/";
  }
});
newPkg.scripts = newPkg.scripts || {};
newPkg.scripts.dev = "vite";
newPkg.scripts.predeploy = "npm run build";
newPkg.scripts.deploy = "gh-pages -d dist";
newPkg.devDependencies = newPkg.devDependencies || {};
newPkg.devDependencies["gh-pages"] = newPkg.devDependencies["gh-pages"] || "^6.3.0";

fs.writeFileSync(pkgPath, JSON.stringify(newPkg, null, 2));
console.log('Patched package.json');

// --- PATCH vite.config.ts ---
const vitePath = path.join(process.cwd(), 'vite.config.ts');
let viteConfig = fs.readFileSync(vitePath, 'utf8');

if (/base:\s*["'][^"']*["']/.test(viteConfig)) {
	// Replace existing base
	viteConfig = viteConfig.replace(/base:\s*["'][^"']*["']/, 'base: "/Enforcer"');
} else {
	// Insert base into the config object (after plugins or server)
	viteConfig = viteConfig.replace(/(plugins: \[react\(\)\],?)/, '$1\n      base: "/Enforcer",');
}

fs.writeFileSync(vitePath, viteConfig);
console.log('Patched vite.config.ts');