#!/usr/bin/env node

// ANSI color codes for rainbow colors
const colors = {
  red: '\x1b[31m',
  orange: '\x1b[38;5;208m', // Using 256-color mode for orange
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  indigo: '\x1b[38;5;54m', // Using 256-color mode for indigo
  violet: '\x1b[35m',
  reset: '\x1b[0m' // Reset to default color
};

// Rainbow color array
const rainbow = [
  { name: 'Red', color: colors.red },
  { name: 'Orange', color: colors.orange },
  { name: 'Yellow', color: colors.yellow },
  { name: 'Green', color: colors.green },
  { name: 'Blue', color: colors.blue },
  { name: 'Indigo', color: colors.indigo },
  { name: 'Violet', color: colors.violet }
];

console.log('\n🌈 Rainbow Color Test 🌈\n');

// Print each color name in its corresponding color
rainbow.forEach(item => {
  console.log(`${item.color}${item.name}${colors.reset}`);
});

console.log('\n');

// Fun rainbow ASCII art
const rainbowArt = [
  `${colors.red}        ████████████████████████████████${colors.reset}`,
  `${colors.orange}      ██████████████████████████████████${colors.reset}`,
  `${colors.yellow}    ██████████████████████████████████████${colors.reset}`,
  `${colors.green}  ██████████████████████████████████████████${colors.reset}`,
  `${colors.blue}██████████████████████████████████████████████${colors.reset}`,
  `${colors.indigo}██████████████████████████████████████████████${colors.reset}`,
  `${colors.violet}██████████████████████████████████████████████${colors.reset}`
];

console.log('🌈 Rainbow ASCII Art:');
rainbowArt.forEach(line => console.log(line));

console.log('\n✨ Colors of the rainbow! ✨\n');