import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import JsonRpc from 'json-rpc-2.0';
import { rpc } from './rpc.js';
import { SERVER_PORT } from './const.js';
import { ethers } from 'ethers';
import { faucet } from './bridge.js';
import { getMoveHash } from './db.js';

const { JSONRPCServer, createJSONRPCErrorResponse } = JsonRpc;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// JSON-RPC Server initialization
const server = new JSONRPCServer();

// Register RPC methods
Object.entries(rpc).forEach(([method, handler]) => {
    server.addMethod(method, handler);
});

// Global error handler for JSON-RPC
server.applyMiddleware(async (next, request, serverParams) => {
    try {
        return await next(request, serverParams);
    } catch (error) {
        const message = typeof error === 'string' ? error : error?.message || 'Internal error';
        const code = error?.code || -32000;
        return createJSONRPCErrorResponse(request.id, code, message, { message });
    }
});

// Ethereum faucet endpoint
app.get('/v1/eth_faucet', async (req, res) => {
    const address = req.query.address;
    
    if (!ethers.isAddress(address)) {
        return res.status(400).json({ error: 'invalid address' });
    }

    try {
        const hash = await faucet(address);
        return res.json({ data: hash });
    } catch (error) {
        return res.status(400).json({ error: 'please try again after 10 minutes' });
    }
});

// Get move hash endpoint
app.get('/v1/move_hash', async (req, res) => {
    const hash = req.query.hash?.toLowerCase() || '0x1';
    const moveHash = await getMoveHash(hash);
    return res.status(200).json({ data: moveHash });
});

// Middleware for handling JSON-RPC requests at /v1 endpoint
app.use('/v1', async (req, res) => {
    const context = { ip: req.ip };
    console.log('>>> %s %s', context.ip, req.body.method);

    const requestString = `<<< ${JSON.stringify(req.body)}`;
    const jsonRPCResponse = await server.receive(req.body);

    if (jsonRPCResponse.error) {
        console.error(requestString, jsonRPCResponse);
    } else {
        console.log(requestString, jsonRPCResponse);
    }

    res.json(Array.isArray(req.body) && req.body.length === 1 ? [jsonRPCResponse] : jsonRPCResponse);
});

// Middleware for handling JSON-RPC requests at root endpoint
app.use('/', async (req, res) => {
    const context = { ip: req.ip };
    console.log('>>> %s %s', context.ip, req.body.method);

    const requestString = `<<< ${JSON.stringify(req.body)}`;
    const jsonRPCResponse = await server.receive(req.body);

    if (jsonRPCResponse.error) {
        console.error(requestString, jsonRPCResponse);
    } else {
        console.log(requestString, jsonRPCResponse);
    }

    res.json(Array.isArray(req.body) && req.body.length === 1 ? [jsonRPCResponse] : jsonRPCResponse);
});

// Trust proxy (if behind a reverse proxy)
app.set('trust proxy', true);

// Start server
app.listen(SERVER_PORT, () => {
    console.log(`Server started at http://127.0.0.1:${SERVER_PORT}`);
});

// Import tasks (presumably for side effects)
import('./task.js');
