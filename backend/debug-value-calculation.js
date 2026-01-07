// Debug script to trace value bet calculations
import dotenv from 'dotenv';
dotenv.config();

// Simulate the Poisson calculations used in the model
function poissonProbability(lambda, k) {
  return Math.pow(lambda, k) * Math.exp(-lambda) / factorial(k);
}

function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonOver(lambda, k) {
  // P(X >= k) = 1 - P(X < k) = 1 - sum(P(X=i) for i=0 to k-1)
  let prob = 0;
  for (let i = 0; i < k; i++) {
    prob += poissonProbability(lambda, i);
  }
  return 1 - prob;
}

function poissonUnder(lambda, k) {
  // P(X <= k) = sum(P(X=i) for i=0 to k)
  let prob = 0;
  for (let i = 0; i <= k; i++) {
    prob += poissonProbability(lambda, i);
  }
  return prob;
}

// Test offsides model with league averages
const LEAGUE_AVERAGES = {
  offsides: 2.2,      // per team per match
  throwIns: 22.0,     // per team per match
};

console.log('='.repeat(60));
console.log('VALUE BET CALCULATION DEBUG');
console.log('='.repeat(60));

// Simulate offsides calculation
const homeOffsides = LEAGUE_AVERAGES.offsides * 1.05; // Home factor
const awayOffsides = LEAGUE_AVERAGES.offsides * 0.95; // Away factor
const totalOffsides = homeOffsides + awayOffsides;

console.log('\n--- OFFSIDES MODEL ---');
console.log(`Home expected: ${homeOffsides.toFixed(2)}`);
console.log(`Away expected: ${awayOffsides.toFixed(2)}`);
console.log(`Total expected: ${totalOffsides.toFixed(2)}`);

// Calculate probabilities for common offsides lines
const offsidesLines = [2.5, 3.5, 4.5, 5.5, 6.5];
console.log('\nOffsides Probabilities:');
for (const line of offsidesLines) {
  const threshold = Math.floor(line);
  const overProb = poissonOver(totalOffsides, threshold + 1);
  const underProb = poissonUnder(totalOffsides, threshold);
  console.log(`  Over ${line}: ${(overProb * 100).toFixed(2)}% (fair odds: ${(1/overProb).toFixed(2)})`);
  console.log(`  Under ${line}: ${(underProb * 100).toFixed(2)}% (fair odds: ${(1/underProb).toFixed(2)})`);
}

// Simulate edge calculation
console.log('\n--- EDGE CALCULATIONS (if bookmaker offers) ---');
const exampleOdds = {
  'over_2.5': 1.40,  // Bookmaker odds
  'under_2.5': 2.90,
  'over_3.5': 1.80,
  'under_3.5': 2.00,
  'over_4.5': 2.50,
  'under_4.5': 1.55,
};

for (const [marketKey, bookOdds] of Object.entries(exampleOdds)) {
  const [direction, lineStr] = marketKey.split('_');
  const line = parseFloat(lineStr);
  const threshold = Math.floor(line);

  const prob = direction === 'over'
    ? poissonOver(totalOffsides, threshold + 1)
    : poissonUnder(totalOffsides, threshold);

  const edge = (prob * bookOdds) - 1;
  const fairOdds = 1 / prob;

  console.log(`  ${marketKey}: Prob=${(prob*100).toFixed(2)}%, BookOdds=${bookOdds.toFixed(2)}, FairOdds=${fairOdds.toFixed(2)}, Edge=${(edge*100).toFixed(2)}%`);
}

// Test with very low line (1.5) - this might cause high edges
console.log('\n--- TESTING LOW LINES (possible cause of 100%+ edges) ---');
const lowLines = [0.5, 1.5];
for (const line of lowLines) {
  const threshold = Math.floor(line);
  const overProb = poissonOver(totalOffsides, threshold + 1);
  console.log(`  Over ${line}: Prob=${(overProb * 100).toFixed(2)}%`);

  // If bookmaker offers 2.90 for Over 1.5 offsides
  if (line === 1.5) {
    const bookOdds = 2.90;
    const edge = (overProb * bookOdds) - 1;
    console.log(`    If bookmaker offers ${bookOdds} for Over 1.5: Edge = ${(edge * 100).toFixed(2)}%`);
  }
}

// Simulate throw-ins calculation
console.log('\n--- THROW-INS MODEL ---');
const homeThrowIns = LEAGUE_AVERAGES.throwIns * 1.03; // Home factor
const awayThrowIns = LEAGUE_AVERAGES.throwIns * 0.97; // Away factor
const totalThrowIns = homeThrowIns + awayThrowIns;

console.log(`Home expected: ${homeThrowIns.toFixed(2)}`);
console.log(`Away expected: ${awayThrowIns.toFixed(2)}`);
console.log(`Total expected: ${totalThrowIns.toFixed(2)}`);

// Common throw-ins lines
const throwInsLines = [35.5, 39.5, 43.5, 47.5, 51.5];
console.log('\nThrow-Ins Probabilities:');
for (const line of throwInsLines) {
  const threshold = Math.floor(line);
  const overProb = poissonOver(totalThrowIns, threshold + 1);
  const underProb = poissonUnder(totalThrowIns, threshold);
  console.log(`  Over ${line}: ${(overProb * 100).toFixed(2)}% (fair odds: ${(1/overProb).toFixed(2)})`);
  console.log(`  Under ${line}: ${(underProb * 100).toFixed(2)}% (fair odds: ${(1/underProb).toFixed(2)})`);
}

// Test edge with example odds
console.log('\n--- THROW-INS EDGE EXAMPLE ---');
const throwInsExampleOdds = {
  'over_39.5': 1.85,
  'under_39.5': 1.95,
  'over_43.5': 2.40,
  'under_43.5': 1.57,
};

for (const [marketKey, bookOdds] of Object.entries(throwInsExampleOdds)) {
  const [direction, lineStr] = marketKey.split('_');
  const line = parseFloat(lineStr);
  const threshold = Math.floor(line);

  const prob = direction === 'over'
    ? poissonOver(totalThrowIns, threshold + 1)
    : poissonUnder(totalThrowIns, threshold);

  const edge = (prob * bookOdds) - 1;
  const fairOdds = 1 / prob;

  console.log(`  ${marketKey}: Prob=${(prob*100).toFixed(2)}%, BookOdds=${bookOdds.toFixed(2)}, FairOdds=${fairOdds.toFixed(2)}, Edge=${(edge*100).toFixed(2)}%`);
}

console.log('\n='.repeat(60));
console.log('CONCLUSION:');
console.log('='.repeat(60));
console.log(`
With correct league averages:
- Offsides total expected: ~4.4 per match
- Throw-ins total expected: ~44 per match

Typical edges should be 2-15% for genuine value bets.
If edges are 100%+, possible causes:
1. Odds being parsed incorrectly (e.g., American vs Decimal)
2. Market line mismatch (betting on team total vs match total)
3. Lambda (expected value) is drastically wrong

Check the actual bookmaker odds and market types in the UI.
`);
