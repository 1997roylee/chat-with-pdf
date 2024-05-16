// const { OpenAIThread, rewriteResponse } = require("./utils")

import { OpenAIThread, rewriteResponse } from './utils';
// import OpenAI from 'openai';

const ASSISTANT_ID = 'asst_eeKychBdzSyBlAeNfdRzw1Bu'; // Your Assistant ID

export async function requestApi(question: string) {
  const thread = new OpenAIThread(ASSISTANT_ID);

  // Register necessary event handlers
  let responseContent: any[] | null = null;

  thread.registerEvent('completed', async () => {
    const response = await thread.getResponse();
    responseContent = response.content;
    // console.log("Assistant Response:", responseContent);
  });

  thread.registerEvent('failed', (run: string) => {
    console.error('Assistant run failed:', run);
  });

  try {
    await thread.createThread();
    await thread.createUserMessage(question);
    await thread.runThreadAndWait();

    const promptText = `As a writing assistant, your role is to rewrite the provided information into a readable paragraph, removing any HTML or Markdown formatting while retaining the original language. This task requires strong writing skills and familiarity with HTML and Markdown formatting. You will need to explicit tell the language of the information. Your goal is to create a clear and coherent paragraph in the same language as the provided information, that communicates the information effectively without the use of formatting tags. : \n\n ${(responseContent?.[0] as any).text.value}`;
    const result2 = await rewriteResponse(promptText);

    return {
      original: (responseContent?.[0] as any).text.value,
      rewritten: result2
    }; // Return the response content
  } catch (error) {
    console.error('Error interacting with the assistant:', error);
    return null; // Return null if there's an error
  }
}

// module.exports = {
//     requestApi,
//     rewriteResponse
// }
