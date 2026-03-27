const autocannon = require('autocannon');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

const endpoints = [
  { name: 'Home', path: '/', method: 'GET' },
  { name: 'Login Page', path: '/login', method: 'GET' },
  { name: 'Register Page', path: '/register', method: 'GET' },
  { name: 'Contact Page', path: '/contact', method: 'GET' },
  { name: 'Services', path: '/services', method: 'GET' },
  { name: 'Products', path: '/products', method: 'GET' },
  { name: 'API - Services', path: '/api/services', method: 'GET' },
  { name: 'API - Contact', path: '/api/contact', method: 'POST', body: { name: 'Test', email: 'test@test.com', message: 'Load test' } },
];

async function testRateLimit() {
  console.log('\n🧪 Testing Rate Limiting Protection');
  console.log('   Sending rapid requests to trigger rate limit...\n');

  const result = await autocannon({
    url: `${BASE_URL}/api/services`,
    connections: 50,
    duration: 15,
    headers: { 'User-Agent': 'RateLimitTest/1.0' }
  });

  const rateLimited = result.non2xx > 0;
  console.log(`📊 Rate Limit Test:`);
  console.log(`   Total Requests: ${result.requests.total}`);
  console.log(`   429 Responses: ${result.non2xx}`);
  console.log(`   Rate Limiting: ${rateLimited ? '✅ ACTIVE' : '⚠️ NOT DETECTED'}`);

  return { rateLimited, non2xx: result.non2xx };
}

async function testPostRequests() {
  console.log('\n🧪 Testing POST Request Handling');

  const result = await autocannon({
    url: `${BASE_URL}/api/contact`,
    method: 'POST',
    connections: 20,
    duration: 10,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'POSTTest/1.0'
    },
    body: JSON.stringify({ name: 'LoadTest', email: 'test@loadtest.com', message: 'Testing POST endpoint performance' })
  });

  console.log(`📊 POST Test Results:`);
  console.log(`   Requests: ${result.requests.total}`);
  console.log(`   Errors: ${result.errors}`);
  console.log(`   Non-2xx: ${result.non2xx}`);
  console.log(`   Latency Mean: ${result.latency.mean.toFixed(2)}ms`);

  return result;
}

async function runLoadTest(endpoint, connections = 100, duration = 30) {
  console.log(`\n🧪 Testing: ${endpoint.name} (${endpoint.method} ${endpoint.path})`);
  console.log(`   Connections: ${connections}, Duration: ${duration}s`);

  const result = await autocannon({
    url: `${BASE_URL}${endpoint.path}`,
    method: endpoint.method,
    connections,
    duration,
    headers: {
      'User-Agent': 'LoadTest/1.0'
    }
  });

  console.log(`\n📊 Results for ${endpoint.name}:`);
  console.log(`   Requests: ${result.requests.total}`);
  console.log(`   Throughput: ${Math.round(result.throughput.mean)} bytes/s`);
  console.log(`   Latency (ms):`);
  console.log(`     - Mean: ${result.latency.mean.toFixed(2)}`);
  console.log(`     - P50: ${result.latency.p50}`);
  console.log(`     - P90: ${result.latency.p90}`);
  console.log(`     - P99: ${result.latency.p99}`);
  console.log(`   Errors: ${result.errors}`);
  console.log(`   Timeouts: ${result.timeouts}`);
  console.log(`   Non-2xx: ${result.non2xx}`);

  return result;
}

async function runStressTest() {
  console.log('🔥 Starting Stress Test - High Load');
  console.log(`   Target: ${BASE_URL}`);
  console.log('   Connections: 200, Duration: 60s\n');

  const result = await autocannon({
    url: `${BASE_URL}/`,
    connections: 200,
    duration: 60,
    pipelining: 10,
    headers: {
      'User-Agent': 'StressTest/1.0'
    }
  });

  console.log(`\n📈 Stress Test Results:`);
  console.log(`   Total Requests: ${result.requests.total}`);
  console.log(`   RPS: ${result.requests.mean.toFixed(2)}`);
  console.log(`   Latency (mean): ${result.latency.mean.toFixed(2)}ms`);
  console.log(`   Errors: ${result.errors}`);
  console.log(`   Blocked/429: ${result.non2xx}`);

  return result;
}

async function main() {
  console.log('⚡ Load Testing Script for Electron Vision');
  console.log('=========================================\n');

  const args = process.argv.slice(2);
  const testType = args[0] || 'all';

  if (testType === 'stress') {
    await runStressTest();
  } else if (testType === 'quick') {
    for (const endpoint of endpoints) {
      await runLoadTest(endpoint, 50, 10);
    }
  } else if (testType === 'ratelimit') {
    await testRateLimit();
  } else if (testType === 'post') {
    await testPostRequests();
  } else {
    // Full test suite
    console.log('📋 Running Basic Load Tests...\n');
    for (const endpoint of endpoints) {
      await runLoadTest(endpoint, 100, 30);
    }

    console.log('\n\n🚀 Running Stress Test...\n');
    await runStressTest();

    console.log('\n\n🛡️ Testing Rate Limiting...\n');
    await testRateLimit();

    console.log('\n\n📝 Testing POST Endpoints...\n');
    await testPostRequests();
  }

  console.log('\n✅ Load Testing Complete');
}

main().catch(console.error);