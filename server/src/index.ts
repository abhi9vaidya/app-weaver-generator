import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Middleware to verify user and get app config
const getAppConfig = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { appId } = req.params;
  
  const { data: appData, error } = await supabase
    .from('generated_apps')
    .select('*')
    .eq('id', appId)
    .single();

  if (error || !appData) {
    return res.status(404).json({ error: 'App not found' });
  }

  (req as any).appConfig = appData.normalized_config || appData.config;
  next();
};

// Dynamic CRUD Endpoints
app.get('/api/dyn/:appId/:entity', getAppConfig, async (req: any, res: any) => {
  const { appId, entity } = req.params;
  
  const { data, error } = await supabase
    .from('app_records')
    .select('*')
    .eq('app_id', appId)
    .eq('entity', entity)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/dyn/:appId/:entity', getAppConfig, async (req: any, res: any) => {
  const { appId, entity: entityName } = req.params;
  const config = req.appConfig;
  const entity = config.database?.entities?.find((e: any) => e.name === entityName);

  if (!entity) return res.status(400).json({ error: 'Entity not defined in config' });

  // Simple validation based on config
  const recordData = req.body;
  const errors: Record<string, string> = {};
  
  for (const field of entity.fields || []) {
    const value = recordData[field.key];
    if (field.required && (value === undefined || value === null || String(value).trim() === '')) {
      errors[field.key] = `${field.label || field.key} is required`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(422).json({ errors });
  }

  // Save to Supabase
  const { data, error } = await supabase
    .from('app_records')
    .insert({
      app_id: appId,
      entity: entityName,
      data: recordData,
      user_id: req.headers['x-user-id'] // In a real app, this would be from auth middleware
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  
  // Trigger notification event
  await supabase.from('app_notifications').insert({
    app_id: appId,
    title: 'New Record Created',
    body: `A new ${entity.label || entityName} was added via the dynamic API.`,
    event_type: 'record.created'
  });

  res.status(201).json(data);
});

app.listen(port, () => {
  console.log(`Backend engine running at http://localhost:${port}`);
});
