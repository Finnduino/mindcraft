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

@sio.on('context-update')
def on_context_update(update_type, data):
    """Handles context updates forwarded by the server."""
    agent_name = data.get('agentName', 'Unknown Agent')
    print(f"\n[Context Update for {agent_name} - Type: {update_type}]:")
    # Pretty print the data dictionary
    import json
    print(json.dumps(data, indent=2))
    print("> ", end='')

@sio.on('llm-prompting')
def on_llm_prompting(data):
    """Handles LLM prompting context updates."""
    agent_name = data.get('agentName', 'Unknown Agent')
    print(f"\n[LLM Prompting for {agent_name}]:")
    import json
    print(json.dumps(data, indent=2))
    print("> ", end='')

@sio.on('llm-response')
def on_llm_response(data):
    """Handles LLM response context updates."""
    agent_name = data.get('agentName', 'Unknown Agent')
    print(f"\n[LLM Response from {agent_name}]:")
    import json
    print(json.dumps(data, indent=2))
    print("> ", end='')

@sio.on('external-command-error')
def on_external_command_error(data):
    """Handles errors when sending external commands."""
    agent_name = data.get('agentName', 'Unknown Agent')
    command = data.get('command', '')
    error = data.get('error', 'Unknown error')
    print(f"\n[External Command Error for {agent_name}]:")
    print(f"Command: {command}")
    print(f"Error: {error}")
    print("> ", end='')

@sio.on('external-command-result')
def on_external_command_result(data):
    """Handles results after an external command is processed by the agent."""
    agent_name = data.get('agentName', 'Unknown Agent')
    command = data.get('command', '')
    result = data.get('result', 'No result info')
    print(f"\n[External Command Result for {agent_name}]:")
    print(f"Command: {command}")
    print(f"Result: {result}")
    print("> ", end='')

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

def send_external_command(target_agent_name, command_string):
    """Sends a command string to a specific agent via the server's 'external-command' route."""
    if not target_agent_name or not command_string:
        print("Error: Target agent name and command string cannot be empty.")
        return
    print(f"Sending external command to {target_agent_name}: {command_string}")
    sio.emit('external-command', (target_agent_name, command_string))

# --- Main Execution ---
if __name__ == '__main__':
    try:
        print(f"Attempting to connect to MindServer at {SERVER_URL}...")
        sio.connect(SERVER_URL)

        print("\nPython messaging client connected. Listening for events.")
        print("You can call functions like:")
        print("  send_message_to_agent('TargetAgentName', 'Your message or !command')")
        print("  execute_agent_chat('TargetAgentName', 'Message for bot to say')")
        print("  send_external_command('TargetAgentName', '!commandToExecute(args)')") # Added command info
        print("Type 'exit' to quit.")

        while True:
            try:
                cmd = input("> ")
                if cmd.lower() == 'exit':
                    break
                # Basic command execution (for demonstration)
                try:
                    # Allow calling functions directly
                    if cmd.startswith("send_message_to_agent") or cmd.startswith("execute_agent_chat") or cmd.startswith("send_external_command"): # Updated condition
                         exec(cmd)
                    else:
                         print("Unknown command. Try: send_message_to_agent(...), execute_agent_chat(...) or send_external_command(...)") # Updated help
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