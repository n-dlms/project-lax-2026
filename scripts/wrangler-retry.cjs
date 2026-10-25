// Cloudflare API connections from this network intermittently reset before a
// response. Retry only methods that Undici treats as safe to repeat.
const dns = require('node:dns');
const { Agent, RetryAgent, setGlobalDispatcher } = require('undici');

dns.setDefaultResultOrder('ipv4first');
setGlobalDispatcher(new RetryAgent(new Agent(), {
  maxRetries: 8,
  minTimeout: 250,
  maxTimeout: 2000,
  methods: ['GET', 'PUT', 'HEAD', 'OPTIONS', 'DELETE'],
}));
