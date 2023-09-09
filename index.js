require('dotenv').config();
const framework = require('connect');
const http = require('http');
const QS = require('node:querystring');
const URL = require('node:url');
const Logger = require('lib/logger');

const app = framework();
const store = new Map();

app.use('/verify', (req, res) => {
    const ORIGINAL_URI = req.headers['x-original-uri'];
    const REMOTE_IP = req.headers['x-forwarded-for'];

    const VERIFY_OPTIONS = QS.parse(URL.parse(req.url)?.query);

    const logger = new Logger();
    logger.addScrubString(process.env.KEY);
    logger.addScrubString(VERIFY_OPTIONS.key);
    logger.addPrefix(REMOTE_IP);
    logger.addPrefix(ORIGINAL_URI, true);

    if (store.has(REMOTE_IP)) {
        const entry = store.get(REMOTE_IP);
        const now = new Date().getTime();
        if (now >= parseInt(entry?.expirationTimestamp)) {
            store.delete(REMOTE_IP);
            res.statusCode = 403;
            logger.log('IP expired, rejected.');
        }
        else {
            res.statusCode = 200;
            logger.log('IP found, allowed.');
        }
    }
    else {
        const POTENTIAL_URI_KEY = URL.parse(ORIGINAL_URI).query;

        let matched = 0;
        if (POTENTIAL_URI_KEY === VERIFY_OPTIONS.key) {
            matched = 1;
        }
        else if (POTENTIAL_URI_KEY === process.env.KEY) {
            matched = 2;
        }

        if (matched > 0) {
            const now = new Date().getTime();
            const exp = new Date(now + parseInt(process.env.VALIDITY_MS)).getTime();
            store.set(REMOTE_IP, {
                expirationTimestamp: exp,
            });
            res.statusCode = 200;
            const keySource = matched === 1 ? 'proxy value' : 'server value';
            logger.log(`Key matched ${keySource}, IP added, allowed.`);
        }
        else {
            res.statusCode = 403;
            logger.log('No key, no IP, rejected.');
        }
    }
    res.end();
});

app.use('/allow', (req ,res) => {
    res.statusCode = 200;
    res.end('ALLOWED');
});

app.use('/reject', (req ,res) => {
    res.statusCode = 403;
    res.end('REJECTED');
});

http.createServer(app).listen(process.env.PORT, process.env.HOST);
console.log(`Listening on ${process.env.HOST}:${process.env.PORT}.`);
