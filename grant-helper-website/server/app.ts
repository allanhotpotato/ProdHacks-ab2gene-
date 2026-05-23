import express from 'express';
import cors from 'cors';
import extractDocumentsRouter from './routes/extractDocuments.js';
import chatRouter from './routes/chat.js';
import autofillRouter from './routes/autofill.js';
import googleFormRouter from './routes/googleForm.js';
import grantsRouter from './routes/grants.js';
import profileRouter from './routes/profile.js';
import einLookupRouter from './routes/einLookup.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/extract-documents', extractDocumentsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/autofill-field', autofillRouter);
app.use('/api/google-form', googleFormRouter);
app.use('/api/grants', grantsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/ein-lookup', einLookupRouter);

export default app;
