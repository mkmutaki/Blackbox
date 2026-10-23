// Resolves req.ip to the real client when the request came through
// Cloudflare, which Render puts in front of every service.
//
// `trust proxy` (app.js) skips Render's private internal hops, which leaves
// req.ip at the first public hop. On Render that hop is a Cloudflare edge
// address (a deploy logged 104.22.160.49 for every user), shared by many
// unrelated clients. Cloudflare passes the real client in CF-Connecting-IP
// and overwrites any value a client sends, so the header is used — but
// only when the hop Render's own proxy recorded is a Cloudflare address.
// A request that didn't come through Cloudflare can't make its
// CF-Connecting-IP count.
//
// Fails safe: if Cloudflare adds a range not listed below, or stops sending
// the header, req.ip stays the edge address (shared buckets again), never
// a client-chosen value.
const net = require('node:net');

// https://www.cloudflare.com/ips-v4 and /ips-v6, fetched 2026-10-23.
const CLOUDFLARE_RANGES = {
  ipv4: [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
    '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
    '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  ],
  ipv6: [
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
    '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
  ],
};

const cloudflare = new net.BlockList();
for (const [type, ranges] of Object.entries(CLOUDFLARE_RANGES)) {
  for (const range of ranges) {
    const [address, prefix] = range.split('/');
    cloudflare.addSubnet(address, Number(prefix), type);
  }
}

// IPv4 clients often appear as IPv4-mapped IPv6 (::ffff:1.2.3.4).
const normalize = (ip) => (ip.startsWith('::ffff:') && net.isIPv4(ip.slice(7)) ? ip.slice(7) : ip);

const isCloudflare = (ip) => {
  if (typeof ip !== 'string') return false;
  const address = normalize(ip);
  const version = net.isIP(address);
  return version !== 0 && cloudflare.check(address, version === 4 ? 'ipv4' : 'ipv6');
};

const resolveClientIp = (req) => {
  const hop = req.ip;
  if (!isCloudflare(hop)) return hop;

  const header = req.headers['cf-connecting-ip'];
  const claimed = typeof header === 'string' ? normalize(header.trim()) : '';
  return net.isIP(claimed) ? claimed : hop;
};

// Shadows Express's req.ip getter with the resolved value, so rate
// limiting, the CSRF check and security logging all see the same client.
const clientIp = (req, res, next) => {
  Object.defineProperty(req, 'ip', { value: resolveClientIp(req), configurable: true, enumerable: true });
  next();
};

module.exports = { clientIp, isCloudflare };
