#!/usr/bin/env node
/*
 * Stops an OTA when JavaScript packages with native code differ from the
 * versions recorded in package-lock.json. A semver drift can make a bundle
 * crash on boot by calling a native method absent from the installed APK.
 */
const fs = require('fs');
const path = require('path');

const packages = [
  'expo', 'expo-modules-core', 'expo-updates', 'react-native',
  'react-native-gesture-handler', 'react-native-reanimated',
  'react-native-safe-area-context', 'react-native-screens',
  'react-native-webview', 'react-native-worklets',
];
const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));
const mismatches = [];

for (const name of packages) {
  const locked = lock.packages?.[`node_modules/${name}`]?.version;
  let installed;
  try {
    installed = require(path.join(__dirname, '..', 'node_modules', name, 'package.json')).version;
  } catch {
    mismatches.push(`${name}: non installato (lock: ${locked ?? 'assente'})`);
    continue;
  }
  if (!locked) mismatches.push(`${name}: assente dal package-lock (installato: ${installed})`);
  else if (installed !== locked) mismatches.push(`${name}: installato ${installed}, lock ${locked}`);
}

if (mismatches.length) {
  console.error('\nBLOCCO OTA: dipendenze native non allineate all\'APK/lockfile.');
  for (const mismatch of mismatches) console.error(` - ${mismatch}`);
  console.error('\nEsegui un install pulito dal lockfile oppure costruisci un nuovo APK con un lockfile aggiornato.');
  process.exit(1);
}
console.log('OK: dipendenze native allineate al package-lock.');
