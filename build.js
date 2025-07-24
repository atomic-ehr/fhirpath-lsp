const esbuild = require('esbuild');
const path = require('path');

async function build() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  console.log('Building client...');
  await esbuild.build({
    entryPoints: ['client/src/extension.ts'],
    bundle: true,
    outfile: 'client/out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    sourcemap: true,
    minify: isProduction
  });
  
  console.log('Building server...');
  await esbuild.build({
    entryPoints: ['server/src/server.ts'],
    bundle: true,
    outfile: 'server/out/server.js',
    external: ['vscode-languageserver', 'vscode-languageserver-textdocument'],
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    sourcemap: true,
    minify: isProduction
  });
  
  console.log('Build complete!');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});