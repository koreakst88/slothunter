import 'dotenv/config';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Client } from '../monitor/checker';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_KEY in environment variables');
}

export const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

export async function getActiveClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('status', 'active');

  if (error) {
    throw new Error(`Failed to fetch active clients: ${error.message}`);
  }

  const clients = (data || []) as Client[];
  console.log(`[DB] Fetched ${clients.length} active clients`);
  return clients;
}

export async function updateClientAfterReschedule(
  clientId: string,
  newDate: string,
  attemptsLeft: number
): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({
      current_date: newDate,
      attempts_left: attemptsLeft - 1,
      status: 'done'
    })
    .eq('id', clientId);

  if (error) {
    throw new Error(`Failed to update client after reschedule: ${error.message}`);
  }

  console.log(`[DB] Updated client ${clientId}: new date ${newDate}`);
}

export async function updateClientStatus(
  clientId: string,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ status })
    .eq('id', clientId);

  if (error) {
    throw new Error(`Failed to update client status: ${error.message}`);
  }

  console.log(`[DB] Status updated for ${clientId}: ${status}`);
}

export async function addLog(
  clientId: string,
  action: string,
  result: string,
  dateFound?: string,
  dateBooked?: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('logs')
      .insert({
        client_id: clientId,
        action,
        result,
        date_found: dateFound,
        date_booked: dateBooked
      });

    if (error) {
      console.error(`[DB] Error adding log: ${error.message}`);
      return;
    }

    console.log(`[DB] Log added for client ${clientId}: ${action}`);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[DB] Exception adding log: ${errorMessage}`);
  }
}

export async function getAllClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*');

  if (error) {
    throw new Error(`Failed to fetch all clients: ${error.message}`);
  }

  const clients = (data || []) as Client[];
  console.log(`[DB] Fetched ${clients.length} total clients`);
  return clients;
}

export async function createClient(data: {
  name: string;
  email: string;
  password_encrypted: string;
  schedule_id: string;
  applicant_ids: string[];
  current_date: string;
  status: string;
  attempts_left: number;
}): Promise<Client> {
  const { data: insertedData, error } = await supabase
    .from('clients')
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create client: ${error.message}`);
  }

  console.log(`[DB] Created client ${insertedData.name}`);
  return insertedData as Client;
}

export interface Log {
  id: string;
  client_id: string;
  action: string;
  result: string | null;
  date_found: string | null;
  date_booked: string | null;
  created_at: string;
}

export async function getClientLogs(clientId: string): Promise<Log[]> {
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Failed to fetch logs: ${error.message}`);
  }

  return (data || []) as Log[];
}

export async function getClientById(clientId: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch client: ${error.message}`);
  }

  return data ? (data as Client) : null;
}

