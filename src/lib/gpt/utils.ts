// const OpenAI =  require("openai");

import OpenAI from 'openai';

const openai = new OpenAI();

export class OpenAIThread {
  public assistant_id: string;
  public eventWatchers: any[];
  public functions: any;
  public interval: any;
  public thread: OpenAI.Beta.Threads.Thread | undefined;
  public run: OpenAI.Beta.Threads.Runs.Run | undefined;

  constructor(assistant_id: string) {
    this.assistant_id = assistant_id;
    this.eventWatchers = [];
    this.functions = {};
    this.interval = null;
  }

  async createThread() {
    try {
      const thread = await openai.beta.threads.create();
      this.thread = thread;
      return thread;
    } catch (error) {
      console.error('Error creating thread:', error);
      throw error;
    }
  }

  async createUserMessage(content: string) {
    if (!this.thread) {
      throw new Error('Thread not created');
    }
    try {
      const message = await openai.beta.threads.messages.create(this.thread.id, {
        role: 'user',
        content
      });
      return message;
    } catch (error) {
      console.error('Error creating user message:', error);
      throw error;
    }
  }

  async runThread(instructions = '') {
    if (!this.thread) {
      throw new Error('Thread not created');
    }
    try {
      const run = await openai.beta.threads.runs.create(this.thread.id, {
        assistant_id: this.assistant_id,
        instructions
      });

      this.run = run;

      await this.pollRun();

      this.interval = setInterval(() => this.pollRunInterval(), 1000);

      return run;
    } catch (error) {
      console.error('Error running thread:', error);
      throw error;
    }
  }

  async runThreadAndWait(instructions = '') {
    if (!this.thread) {
      throw new Error('Thread not created');
    }
    try {
      const run = await openai.beta.threads.runs.create(this.thread.id, {
        assistant_id: this.assistant_id,
        instructions
      });

      this.run = run;

      await this.pollRun();

      this.interval = setInterval(() => this.pollRunInterval(), 1000);

      while (this.interval !== null) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return run;
    } catch (error) {
      console.error('Error running thread:', error);
      throw error;
    }
  }

  async pollRunInterval() {
    try {
      const run = await this.pollRun();
      if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        clearInterval(this.interval);
        this.interval = null;
      }
    } catch (error) {
      clearInterval(this.interval);
      this.interval = null;
      console.error('Error polling run:', error);
    }
  }

  registerEvent(event: string, callback: any) {
    this.eventWatchers.push({ event, callback });
  }

  registerFunction(functionName: string, callback: any) {
    this.functions[functionName] = callback;
  }

  async getResponse() {
    if (!this.thread) {
      throw new Error('Thread not created');
    }
    try {
      const messages = await openai.beta.threads.messages.list(this.thread.id);

      return messages.data[0];
    } catch (error) {
      console.error('Error getting response:', error);
      throw error;
    }
  }

  async getMessages() {
    if (!this.thread) {
      throw new Error('Thread not created');
    }
    try {
      const messages = await openai.beta.threads.messages.list(this.thread.id);

      return messages.data;
    } catch (error) {
      console.error('Error getting messages:', error);
      throw error;
    }
  }

  async pollRun() {
    if (!this.thread || !this.run) {
      throw new Error('Thread or run not created');
    }

    try {
      const running = await openai.beta.threads.runs.retrieve(this.thread.id, this.run.id);

      if (
        running.status === 'requires_action' &&
        running.required_action?.submit_tool_outputs?.tool_calls
      ) {
        const outputs = running.required_action.submit_tool_outputs.tool_calls.map(
          async toolCall => {
            if (toolCall.type !== 'function') {
              console.error(`Tool call type ${toolCall.type} not supported.`);
              return null; // Skip non-function tool calls
            }

            const tool = this.functions[toolCall.function.name];
            if (!tool) {
              console.error(
                `Function ${toolCall.function.name} not found. Did you forget to register it?`
              );
              return null; // Skip if the function is not registered
            }

            try {
              // Assuming the tool functions are async, they should be awaited
              const output = await tool(JSON.parse(toolCall.function.arguments));
              return {
                tool_call_id: toolCall.id,
                output: JSON.stringify(output) // Assuming output should be stringified
              };
            } catch (error) {
              console.error(`Error executing tool function ${toolCall.function.name}:`, error);
              return null; // Return null in case of an error
            }
          }
        );

        const resolvedOutputs = (await Promise.all(outputs)).filter(output => output !== null);

        if (resolvedOutputs.length > 0) {
          try {
            await openai.beta.threads.runs.submitToolOutputs(this.thread.id, this.run.id, {
              tool_outputs: resolvedOutputs as any
            });
          } catch (error) {
            console.error('Error submitting tool outputs:', error);
          }
        }
      }

      for (const watcher of this.eventWatchers.filter(
        watcher => watcher.event === running.status
      )) {
        if (typeof watcher.callback === 'function') {
          await watcher.callback(running);
        }
      }

      return running;
    } catch (error) {
      console.error('Error polling run status:', error);
      throw error;
    }
  }
}

export async function rewriteResponse(promptText: string) {
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'system', content: promptText }],
            max_tokens: 150,
            stop: ['【'],
        });

        console.log('completion: ', completion)

        const rewrittenText = completion.choices[0].message.content;

        return rewrittenText;
    } catch (error) {
        console.error("Error rewriting response:", error);
        return null;
    }
}

// module.exports = {
//     OpenAIThread,
//     rewriteResponse
// }
