import { io } from 'socket.io-client';
import convoManager from './conversation.js';
import settings from '../../settings.js';

class AgentServerProxy {
    constructor() {
        if (AgentServerProxy.instance) {
            return AgentServerProxy.instance;
        }
        
        this.socket = null;
        this.connected = false;
        AgentServerProxy.instance = this;
    }

    connect(agent) {
        if (this.connected) return;
        
        this.agent = agent;

        this.socket = io(`http://${settings.mindserver_host}:${settings.mindserver_port}`);
        this.connected = true;

        this.socket.on('connect', () => {
            console.log('Connected to MindServer');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from MindServer');
            this.connected = false;
        });

        this.socket.on('chat-message', (agentName, json) => {
            convoManager.receiveFromBot(agentName, json);
        });

        this.socket.on('agents-update', (agents) => {
            convoManager.updateAgents(agents);
        });

        this.socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            this.agent.cleanKill();
        });
		
		this.socket.on('send-message', (agentName, message) => {
			try {
				this.agent.respondFunc("NO USERNAME", message);
			} catch (error) {
				console.error('Error: ', JSON.stringify(error, Object.getOwnPropertyNames(error)));
			}
		});
        this.socket.on('execute-chat', (message) => {
            if (this.agent && this.agent.bot) {
                console.log(`Executing chat command from external source: ${message}`);
                // Note: This directly calls the wrapped bot.chat, so it will also trigger the 'botChatSent' event
                this.agent.bot.chat(message);
            }
        });

        this.socket.on('external-command', (commandString) => {
            console.log(`Received external command via proxy: ${commandString}`);
            if (this.agent && this.agent.handleExternalCommand) {
                this.agent.handleExternalCommand(commandString);
            }
        });
    }

    emitContextUpdate(agentName, context) {
        if (this.socket && this.connected) {
            this.socket.emit('context-update', agentName, context);
        }
    }

    login() {
        this.socket.emit('login-agent', this.agent.name);
    }

    shutdown() {
        this.socket.emit('shutdown');
    }


    getSocket() {
        return this.socket;
    }
    sendChatNotification(message) {
        if (this.socket && this.connected) {
            this.socket.emit('bot-chat-sent', this.agent.name, message);
        }
    }
}

// Create and export a singleton instance
export const serverProxy = new AgentServerProxy();

export function sendBotChatToServer(agentName, json) {
    serverProxy.getSocket().emit('chat-message', agentName, json);
}
