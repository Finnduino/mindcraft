import socketio
import time
import sys

# Standard Python client
sio = socketio.Client()

# --- Configuration ---
SERVER_URL = 'http://localhost:8080' # Default port from mind_server.js
MY_AGENT_NAME = "MyPythonClient" # Change this if you need to login as a specific agent

# --- Event Handlers ---
@sio.event
def connect():
    print('Connected to MindServer')
    # Optional: Register this client if it acts as a manager
    # sio.emit('register-agents', [MY_AGENT_NAME])
    # Optional: Login as an agent to receive direct messages/commands
    # sio.emit('login-agent', MY_AGENT_NAME)

@sio.event
def connect_error(data):
    print("Connection failed!")
    print(data)

@sio.event
def disconnect():
    print('Disconnected from MindServer')

@sio.on('chat-message')
def on_chat_message(sender_name, json_data):
    """Handles incoming chat messages forwarded by the server."""
    message = json_data.get('message', '[no message content]')
    print(f"\n[Chat from {sender_name}]: {message}\n> ", end='')

@sio.on('send-message')
def on_send_message(sender_agent_name, message):
    """Handles messages/commands sent directly via the 'send-message' route."""
    # Note: In the JS code, the receiving agent calls agent.respondFunc.
    # This handler simulates receiving that message on the Python side.
    print(f"\n[Direct Message/Command from Server/Agent {sender_agent_name}]: {message}\n> ", end='')

@sio.on('agents-update')
def on_agents_update(agents):
    """Shows agent status updates."""
    print("\n--- Agents Update ---")
    if agents:
        for agent in agents:
            status = 'Online' if agent.get('in_game') else 'Offline'
            print(f"- {agent.get('name', 'Unknown')}: {status}")
    else:
        print("No agents registered.")
    print("---------------------\n> ", end='')

@sio.on('agent-chat-sent')
def on_agent_chat_sent(data):
    """Handles notifications when an agent sends a chat message."""
    agent_name = data.get('agentName', 'Unknown Agent')
    message = data.get('message', '[no message content]')
    print(f"\n[{agent_name} sent chat]: {message}\n> ", end='')


# --- Client Functions to Send Messages/Commands ---

def send_message_to_agent(target_agent_name, message):
    """Sends a message string to a specific agent via the server's 'send-message' route."""
    if not target_agent_name or not message:
        print("Error: Target agent name and message cannot be empty.")
        return
    print(f"Sending message to {target_agent_name}: {message}")
    # This emits the 'send-message' event handled starting at line 118 in mind_server.js
    sio.emit('send-message', (target_agent_name, message))

def execute_agent_chat(target_agent_name, message):
    """Tells a specific agent to send a chat message via the server."""
    if not target_agent_name or not message:
        print("Error: Target agent name and message cannot be empty.")
        return
    print(f"Telling {target_agent_name} to chat: {message}")
    # This emits the 'execute-chat' event handled starting at line 126 in mind_server.js
    sio.emit('execute-chat', (target_agent_name, message))

# --- Main Execution ---
if __name__ == '__main__':
    try:
        print(f"Attempting to connect to MindServer at {SERVER_URL}...")
        sio.connect(SERVER_URL)

        print("\nPython messaging client connected. Listening for events.")
        print("You can call functions like:")
        print("  send_message_to_agent('TargetAgentName', 'Your message or !command')")
        print("  execute_agent_chat('TargetAgentName', 'Message for bot to say')") # Added command info
        print("Type 'exit' to quit.")

        while True:
            try:
                cmd = input("> ")
                if cmd.lower() == 'exit':
                    break
                # Basic command execution (for demonstration)
                try:
                    # Allow calling functions directly
                    if cmd.startswith("send_message_to_agent") or cmd.startswith("execute_agent_chat"): # Updated condition
                         exec(cmd)
                    else:
                         print("Unknown command. Try: send_message_to_agent(...) or execute_agent_chat(...)") # Updated help
                except Exception as e:
                    print(f"Error executing command: {e}")
            except KeyboardInterrupt:
                break # Allow Ctrl+C to exit the loop

    except socketio.exceptions.ConnectionError as e:
        print(f"Could not connect to the server at {SERVER_URL}. Is it running?")
        print(f"Error details: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        if sio.connected:
            print("Disconnecting...")
            sio.disconnect()
        print("Python client finished.")
        sys.exit(0)