import { Pinecone } from '@pinecone-database/pinecone';
import { StreamingTextResponse } from 'ai';
import { getVectorStore } from './vector-store';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { BytesOutputParser } from '@langchain/core/output_parsers';
import { formatDocumentsAsString } from 'langchain/util/document';
import { ChatOpenAI } from '@langchain/openai';
// import { createStreamableValue } from 'ai/rsc';
const questionPrompt = PromptTemplate.fromTemplate(
  `As a writing assistant, your role is to rewrite the provided information into a readable paragraph, removing any HTML or Markdown formatting while retaining the original language. This task requires strong writing skills and familiarity with HTML and Markdown formatting. Your goal is to create a clear and coherent paragraph that communicates the information effectively without the use of formatting tags (使用簡體中文).
  Use the exact wording as the context.
  ----------
  CONTEXT: {context}
  ----------
  CHAT HISTORY: {chatHistory}
  ----------
  QUESTION: {question}
  ----------
  Helpful Answer:`
);

// const TEMPLATE = `You are an enthusiastic AI assistant. Use the following pieces of context to answer the question at the end to someone that does not have techical knowledge about machine learning. When you come across a machine learning term, explain it briefly.
//   If you don't know the answer, say that you don't know. Respond with ten sentences. Please response chinese.
//   Use the exact wording as the context.
//   ----------
//   CONTEXT: {context}
//   ----------
//   CHAT HISTORY: {chatHistory}
//   ----------
//   QUESTION: {question}
//   ----------
//   Helpful Answer:`;

const streamingModel = new ChatOpenAI({
  modelName: 'gpt-4o',
  streaming: true,
  verbose: true,
  temperature: 0.2
});

export async function callChain({
  question,
  chatHistory
}: {
  question: string;
  chatHistory: string;
}) {
  try {
    const sanitizedQuestion = question.trim().replace('\n', ' ');
    const pc = new Pinecone();

    const vectorStore = await getVectorStore(pc);
    const retriever = vectorStore?.asRetriever({ verbose: true });

    const chain = RunnableSequence.from([
      {
        question: (input: { question: string; chatHistory?: string }) => input.question,
        chatHistory: (input: { question: string; chatHistory?: string }) => input.chatHistory ?? '',
        context: async (input: { question: string; chatHistory?: string }) => {
          try {
            const relevantDocs = await retriever?.getRelevantDocuments(input.question);
            if (relevantDocs) {
              const serialized = formatDocumentsAsString(relevantDocs);
              return serialized;
            }
          } catch (err) {
            console.log('An error occurred while attempting to retrieve documents', err);
          }
        }
      },
      questionPrompt,
      streamingModel,
      new BytesOutputParser()
    ]);

    // const model = new ChatOpenAI({
    //   temperature: 0.8,
    // });

    // streamingModel
    // const outputParser = new BytesOutputParser();
    // const prompt = PromptTemplate.fromTemplate(TEMPLATE);
    // const chain = prompt.pipe(streamingModel).pipe(outputParser);
    const stream = await chain.stream({
      question: sanitizedQuestion,
      chatHistory
    });
    
    
    // const stream = await chain.stream({
    //   chat_history: chatHistory,
    //   input: sanitizedQuestion,
    // } as any);
  

    // const aiStream = toAIStream(stream, {
    //   onFinal() {
    //     data.close();
    //   },
    // });
    // return createStreamableValue(stream).value;

    return new StreamingTextResponse(stream);
  } catch (err) {
    console.log('An error occurred while attempting to invoke the chain', err);
  }
}
