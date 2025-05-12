import { Server } from 'socket.io';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// Module-level variables
let io;
let server;
const registeredAgents = new Set();
const inGameAgents = {};
const agentManagers = {}; // socket for main process that registers/controls agents

// Initialize the server
export function createMindServer(port = 8080) {
    const app = express();
    server = http.createServer(app);
    io = new Server(server);

    // Serve static files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));

    // Socket.io connection handling
    io.on('connection', (socket) => {
        let curAgentName = null;
        console.log('Client connected');

        agentsUpdate(socket);

        socket.on('register-agents', (agentNames) => {
            console.log(`Registering agents: ${agentNames}`);
            agentNames.forEach(name => registeredAgents.add(name));
            for (let name of agentNames) {
                agentManagers[name] = socket;
            }
            socket.emit('register-agents-success');
            agentsUpdate();
        });

        socket.on('login-agent', (agentName) => {
            if (curAgentName && curAgentName !== agentName) {
                console.warn(`Agent ${agentName} already logged in as ${curAgentName}`);
                return;
            }
            if (registeredAgents.has(agentName)) {
                curAgentName = agentName;
                inGameAgents[agentName] = socket;
                agentsUpdate();
            } else {
                console.warn(`Agent ${agentName} not registered`);
            }
        });

        socket.on('logout-agent', (agentName) => {
            if (inGameAgents[agentName]) {
                delete inGameAgents[agentName];
                agentsUpdate();
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected');
            if (inGameAgents[curAgentName]) {
                delete inGameAgents[curAgentName];
                agentsUpdate();
            }
        });

        socket.on('chat-message', (agentName, json) => {
            if (!inGameAgents[agentName]) {
                console.warn(`Agent ${agentName} tried to send a message but is not logged in`);
                return;
            }
            console.log(`${curAgentName} sending message to ${agentName}: ${json.message}`);
            inGameAgents[agentName].emit('chat-message', curAgentName, json);
        });

        socket.on('bot-chat-sent', (agentName, message) => {
            if (!inGameAgents[agentName]) {
                console.warn(`Agent ${agentName} not logged in, cannot process bot-chat-sent via MindServer.`); // Updated warning message
                return
            }
            try {
                console.log(`Agent ${agentName} sent chat (for broadcast): ${message}`);
                // Broadcast this to other connected clients (like a Python wrapper)
                socket.broadcast.emit('agent-chat-sent', { agentName, message });
                // --- REMOVE THE LINE BELOW ---
                // inGameAgents[agentName].emit('send-message', agentName, message) // This line causes the loop
            } catch (error) {
                console.error('Error processing bot-chat-sent: ', error); // Updated error message
            }
        });

        // --- Add this handler ---
        // Assuming the Python wrapper sends an event like this:
        // socket.emit('execute-chat', targetAgentName, chatMessage);
        socket.on('execute-chat', (agentName, message) => {
            if (inGameAgents[agentName]) {
                console.log(`Relaying execute-chat command to agent ${agentName}: ${message}`);
                inGameAgents[agentName].emit('execute-chat', message);
            } else {
                console.warn(`Cannot execute chat for non-logged-in agent: ${agentName}`);
                // Optionally send an error back to the Python client
                // socket.emit('execute-chat-error', { agentName, message: 'Agent not found or not logged in' });
            }
        });

        // Handler for context updates from agents
        socket.on('context-update', (updateType, data) => {
            console.log(`Received context update from agent ${data.agentName}: ${updateType}`);
            // Broadcast the update to all connected clients (including the Python wrapper)
            io.emit('context-update', updateType, data);
        });

        // Handler for LLM prompting context
        socket.on('llm-prompting', (data) => {
            console.log(`Received llm-prompting update from agent ${data.agentName}`);
            io.emit('llm-prompting', data); // Broadcast to clients
        });

        // Handler for LLM response context
        socket.on('llm-response', (data) => {
            console.log(`Received llm-response update from agent ${data.agentName}`);
            io.emit('llm-response', data); // Broadcast to clients
        });

        // Handler for external commands from clients (e.g., Python wrapper)
        socket.on('external-command', (targetAgentName, commandString) => {
            if (inGameAgents[targetAgentName]) {
                console.log(`Relaying external command to agent ${targetAgentName}: ${commandString}`);
                inGameAgents[targetAgentName].emit('external-command', commandString);
            } else {
                console.warn(`Cannot relay external command to non-logged-in agent: ${targetAgentName}`);
                // Optionally send an error back to the client
                socket.emit('external-command-error', { agentName: targetAgentName, command: commandString, error: 'Agent not found or not logged in' });
            }
        });

        // --- Add this handler ---
        // Assuming the Python wrapper sends an event like this:
        socket.on('user-command', (commandData) => {
            console.log(`Received user command: ${commandData}`);
            // Process the user command here
        });

        socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            inGameAgents[agentName].emit('restart-agent');
        });

        socket.on('stop-agent', (agentName) => {
            let manager = agentManagers[agentName];
            if (manager) {
                manager.emit('stop-agent', agentName);
            }
            else {
                console.warn(`Stopping unregisterd agent ${agentName}`);
            }
        });

        socket.on('start-agent', (agentName) => {
            let manager = agentManagers[agentName];
            if (manager) {
                manager.emit('start-agent', agentName);
            }
            else {
                console.warn(`Starting unregisterd agent ${agentName}`);
            }
        });

        socket.on('stop-all-agents', () => {
            console.log('Killing all agents');
            stopAllAgents();
        });

        socket.on('shutdown', () => {
            console.log('Shutting down');
            for (let manager of Object.values(agentManagers)) {
                manager.emit('shutdown');
            }
            setTimeout(() => {
                process.exit(0);
            }, 2000);
});


		socket.on('send-message', (agentName, message) => {
			if (!inGameAgents[agentName]) {
				console.warn(`Agent ${agentName} not logged in, cannot send message via MindServer.`);
				return
			}
			try {
				console.log(`Sending message to agent ${agentName}: ${message}`);
				inGameAgents[agentName].emit('send-message', agentName, message)
			} catch (error) {
				console.error('Error: ', error);
			}
		});
    });

    server.listen(port, 'localhost', () => {
        console.log(`MindServer running on port ${port}`);
    });

    return server;
}

function agentsUpdate(socket) {
    if (!socket) {
        socket = io;
    }
    let agents = [];
    registeredAgents.forEach(name => {
        agents.push({name, in_game: !!inGameAgents[name]});
    });
    socket.emit('agents-update', agents);
}

function stopAllAgents() {
    for (const agentName in inGameAgents) {
        let manager = agentManagers[agentName];
        if (manager) {
            manager.emit('stop-agent', agentName);
        }
    }
}

// Optional: export these if you need access to them from other files
export const getIO = () => io;
export const getServer = () => server;
export const getConnectedAgents = () => connectedAgents;
