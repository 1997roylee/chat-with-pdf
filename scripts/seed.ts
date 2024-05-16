import { getEnv, validateEnviromentVariables } from '../utils/env-utils';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ServerlessSpecCloudEnum } from '@pinecone-database/pinecone';

async function indexExists(pineconeClient: Pinecone, indexName: string) {
  try {
    const data = await pineconeClient.listIndexes();
    return data?.indexes?.some(index => index.name === indexName);
  } catch (err) {
    console.error('An error occured while attempting to list an index', err);
    return false;
  }
}

async function createPineconeIndex(
  pineconeClient: Pinecone,
  indexName: string,
  indexCloud: string,
  indexRegion: string
) {
  console.log(`Creating ${indexName} index...`);
  try {
    const index = await indexExists(pineconeClient, indexName);

    if (!index) {
      await pineconeClient.createIndex({
        name: indexName,
        dimension: 256,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: indexCloud as ServerlessSpecCloudEnum,
            region: indexRegion
          }
        },
        waitUntilReady: true
      });

      console.log(`${indexName} index created successfully!`);
    } else {
      return index;
      // return Promise.reject('Seeding the database aborted. Index already exists');
    }
  } catch (err) {
    console.error('An error occurred while attempting to create index:', err);
  }
}

async function getChunkedDocsFromPdf() {
  console.log('Creating chunks from a document...');
  try {
    // by default pdf loader loads each page of a pdf as a Document
    const loader = new PDFLoader('docs/Demo.pdf', {
      splitPages: false
    });
    const docs = await loader.load();

    // by default chunkSize = 1000, chunkOverlap = 200
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 512,
      chunkOverlap: 100
    });
    const chunks = await textSplitter.splitDocuments(docs);

    console.log('Chunks created successfully!');

    return chunks;
  } catch (err) {
    console.error('An error occurred while attempting to load pdf or get chunks:', err);
  }
}

async function seedPineconeDb(pineconeClient: Pinecone) {
  console.log('Seeding the database...');

  const indexName = getEnv('PINECONE_INDEX');
  const indexCloud = getEnv('PINECONE_CLOUD');
  const indexRegion = getEnv('PINECONE_REGION');

  console.log(`Index name: ${indexName}`, `Index cloud: ${indexCloud}`, `Index region: ${indexRegion}`);

  try {
    await createPineconeIndex(pineconeClient, indexName, indexCloud, indexRegion);

    const pineconeIndex = pineconeClient.index(indexName);
    const docs = await getChunkedDocsFromPdf();

    if (docs) {
      await PineconeStore.fromDocuments(
        docs,
        new OpenAIEmbeddings({ modelName: 'text-embedding-3-large', dimensions: 256 }),
        {
          pineconeIndex,
          maxConcurrency: 5,
          textKey: 'text'
        }
      );

      console.log('Database seeded successfully!');
    }
  } catch (err) {
    console.error('An error occurred while attempting to seed the database:', err);
  }
}

async function main() {
  validateEnviromentVariables();
  // Pinecone client automatically reads the PINECONE_API_KEY env variable
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY as string
  });

  await seedPineconeDb(pc);
}

main().catch(err => {
  console.error('An error occurred while attempting to seed the database:', err);
});
