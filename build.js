const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function build() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isWatch = process.argv.includes('--watch');
  
  const sharedConfig = {
    entryPoints: ['shared/src/index.ts'],
    bundle: true,
    outfile: 'shared/out/index.js',
    format: 'esm',
    platform: 'node',
    target: 'node16',
    sourcemap: true,
    minify: isProduction
  };

  const serverConfig = {
    entryPoints: ['server/src/server.ts'],
    bundle: true,
    outfile: 'server/out/server.js',
    external: ['vscode-languageserver', 'vscode-languageserver-textdocument'],
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    sourcemap: true,
    minify: isProduction,
    // Use alias to resolve the ESM package to a CJS compatible version
    alias: {
      '@atomic-ehr/fhirpath': path.resolve('../fhirpath/dist/index.js')
    }
  };

  const clientConfig = {
    entryPoints: ['client/src/extension.ts'],
    bundle: true,
    outfile: 'client/out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    sourcemap: true,
    minify: isProduction
  };

  if (isWatch) {
    console.log('Starting build in watch mode...');
    
    // Create contexts for watch mode
    const sharedContext = await esbuild.context(sharedConfig);
    const serverContext = await esbuild.context(serverConfig);
    const clientContext = await esbuild.context(clientConfig);
    
    // Initial builds
    console.log('Building shared types...');
    await sharedContext.rebuild();
    
    console.log('Building server...');
    await serverContext.rebuild();
    
    console.log('Building client...');
    await clientContext.rebuild();
    
    // Copy extension assets
    console.log('Copying extension assets...');
    copyExtensionAssets();
    
    console.log('Build complete! Watching for changes...');
    
    // Start watching
    await Promise.all([
      sharedContext.watch(),
      serverContext.watch(),
      clientContext.watch()
    ]);
    
  } else {
    // One-time builds
    console.log('Building shared types...');
    await esbuild.build(sharedConfig);
    
    console.log('Building server...');
    await esbuild.build(serverConfig);
    
    console.log('Building client...');
    await esbuild.build(clientConfig);
    
    // Copy additional files for the extension
    console.log('Copying extension assets...');
    copyExtensionAssets();
    
    console.log('Build complete!');
  }
}

function copyExtensionAssets() {
  // Copy language configuration
  if (fs.existsSync('language-configuration.json')) {
    fs.copyFileSync('language-configuration.json', 'client/language-configuration.json');
  }
  
  // Copy syntaxes directory
  if (fs.existsSync('syntaxes')) {
    if (!fs.existsSync('client/syntaxes')) {
      fs.mkdirSync('client/syntaxes', { recursive: true });
    }
    const syntaxFiles = fs.readdirSync('syntaxes');
    for (const file of syntaxFiles) {
      fs.copyFileSync(`syntaxes/${file}`, `client/syntaxes/${file}`);
    }
  }
  
  console.log('Extension assets copied successfully');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});