import assert from 'assert';

export class ActionManager {
    constructor(agent) {
        this.agent = agent;
        this.executing = false;
        this.currentActionLabel = '';
        this.currentActionFn = null;
        this.timedout = false;
        this.resume_func = null;
        this.resume_name = '';
        this.taskStack = [];
    }

    async resumeAction(actionFn, timeout) {
        return await this.runAction(this.resume_name || 'resumed_action', actionFn || this.resume_func, { resume: true, timeout: timeout || 10 });
    }

    async runAction(actionLabel, actionFn, { timeout = 10, resume = false } = {}) {
        if (resume) {
            return this._executeResume(actionLabel, actionFn, timeout);
        } else {
            return this._executeAction(actionLabel, actionFn, timeout);
        }
    }

    async stop() {
        if (!this.executing) return;
        const timeout = setTimeout(() => {
            this.agent.cleanKill('Code execution refused stop after 10 seconds. Killing process.');
        }, 10000);
        while (this.executing) {
            this.agent.requestInterrupt();
            console.log('waiting for code to finish executing...');
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        clearTimeout(timeout);
    } 

    cancelResume() {
        this.resume_func = null;
        this.resume_name = null;
    }

    async _executeResume(actionLabel = null, actionFn = null, timeout = 10) {
        const new_resume = actionFn != null;
        if (new_resume) {
            this.resume_func = actionFn;
            assert(actionLabel != null, 'actionLabel is required for new resume');
            this.resume_name = actionLabel;
        }
        if (this.resume_func != null && (this.agent.isIdle() || new_resume) && (!this.agent.self_prompter.isActive() || new_resume)) {
            this.currentActionLabel = this.resume_name;
            // Don't call _executeAction here as it will trigger _tryResumeFromStack again!
            // Instead, execute the resume function directly
            let res = await this._executeActionDirect(this.resume_name, this.resume_func, timeout);
            this.currentActionLabel = '';
            this.cancelResume(); // Clear resume after execution
            return res;
        } else {
            return { success: false, message: null, interrupted: false, timedout: false };
        }
    }

    // New direct execution method that doesn't trigger task stack logic
    async _executeActionDirect(actionLabel, actionFn, timeout = 10) {
        let TIMEOUT;
        try {
            console.log(`Resuming action: ${actionLabel}`);
            
            this.executing = true;
            this.currentActionLabel = actionLabel;
            this.currentActionFn = actionFn;

            if (timeout > 0) {
                TIMEOUT = this._startTimeout(timeout);
            }

            await actionFn();

            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);

            let output = this.getBotOutputSummary();
            let interrupted = this.agent.bot.interrupt_code;
            let timedout = this.timedout;
            this.agent.clearBotLogs();

            if (!interrupted) {
                this.agent.bot.emit('idle');
            }

            return { success: true, message: output, interrupted, timedout };
        } catch (err) {
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);
            console.error("Resume execution error:", err);
            
            let message = this.getBotOutputSummary() + '!!Resume threw exception!!\nError: ' + err.toString();
            let interrupted = this.agent.bot.interrupt_code;
            this.agent.clearBotLogs();
            
            if (!interrupted) {
                this.agent.bot.emit('idle');
            }
            return { success: false, message, interrupted, timedout: false };
        }
    }

    async _executeAction(actionLabel, actionFn, timeout = 10) {
        let TIMEOUT;
        try {
            console.log('executing code...\n');
            
            // If there's currently an executing action, save it to the stack
            if (this.executing && this.currentActionFn) {
                console.log(`Saving interrupted action "${this.currentActionLabel}" to task stack`);
                this.taskStack.push({
                    label: this.currentActionLabel,
                    actionFn: this.currentActionFn,
                    timestamp: Date.now()
                });
            }

            if (this.executing) {
                console.log(`action "${actionLabel}" trying to interrupt current action "${this.currentActionLabel}"`);
            }
            await this.stop();

            this.agent.clearBotLogs();

            this.executing = true;
            this.currentActionLabel = actionLabel;
            this.currentActionFn = actionFn;

            if (timeout > 0) {
                TIMEOUT = this._startTimeout(timeout);
            }

            await actionFn();

            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);

            // Try to resume from stack after completing current action
            this._tryResumeFromStack();

            let output = this.getBotOutputSummary();
            let interrupted = this.agent.bot.interrupt_code;
            let timedout = this.timedout;
            this.agent.clearBotLogs();

            if (!interrupted) {
                this.agent.bot.emit('idle');
            }

            return { success: true, message: output, interrupted, timedout };
        } catch (err) {
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);
            this.cancelResume();
            console.error("Code execution triggered catch:", err);
            
            let message = this.getBotOutputSummary() + '!!Code threw exception!!\nError: ' + err.toString();
            let interrupted = this.agent.bot.interrupt_code;
            this.agent.clearBotLogs();
            
            if (!interrupted) {
                this.agent.bot.emit('idle');
            }
            return { success: false, message, interrupted, timedout: false };
        }
    }

    _tryResumeFromStack() {
        if (this.taskStack.length > 0 && !this.executing && this.agent.isIdle()) {
            const previousTask = this.taskStack.pop();
            console.log(`Attempting to resume previous task: "${previousTask.label}"`);
            
            // Schedule resume with a small delay to ensure clean state
            setTimeout(async () => {
                if (!this.executing && this.agent.isIdle()) {
                    console.log(`Resuming task: ${previousTask.label}`);
                    await this.runAction(previousTask.label, previousTask.actionFn, { resume: true });
                }
            }, 1000);
        }
    }

    clearTaskStack() {
        console.log(`Clearing ${this.taskStack.length} tasks from stack`);
        this.taskStack = [];
    }

    getTaskStackInfo() {
        return this.taskStack.map(task => ({
            label: task.label,
            timestamp: task.timestamp,
            age: Date.now() - task.timestamp
        }));
    }

    getBotOutputSummary() {
        const { bot } = this.agent;
        if (bot.interrupt_code && !this.timedout) return '';
        let output = bot.output;
        const MAX_OUT = 500;
        if (output.length > MAX_OUT) {
            output = `Action output is very long (${output.length} chars) and has been shortened.\n
          First outputs:\n${output.substring(0, MAX_OUT / 2)}\n...skipping many lines.\nFinal outputs:\n ${output.substring(output.length - MAX_OUT / 2)}`;
        }
        else {
            output = 'Action output:\n' + output.toString();
        }
        bot.output = '';
        return output;
    }

    _startTimeout(TIMEOUT_MINS = 10) {
        return setTimeout(async () => {
            console.warn(`Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            this.timedout = true;
            this.agent.history.add('system', `Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            await this.stop();
        }, TIMEOUT_MINS * 60 * 1000);
    }
}