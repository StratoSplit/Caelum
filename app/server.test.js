const request = require('supertest');
const http = require('http');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.status(200).send('OK'));

describe('GET /', () => {
    let server;

    beforeAll((done) => {
        server = http.createServer(app);
        server.listen(443, done);
    });

    afterAll((done) => {
        server.close(done);
    });

    it('should return 200 OK', async () => {
        const response = await request(server).get('/');
        expect(response.status).toBe(200);
    });
});