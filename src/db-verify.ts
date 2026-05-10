import 'dotenv/config';
import { supabase } from './db/supabase';

async function main() {
  console.log('--- ТАБЛИЦА CLIENTS ---');
  const { data: clients, error: err1 } = await supabase.from('clients').select('*');
  if (err1) console.error(err1);
  else console.log(JSON.stringify(clients, null, 2));

  console.log('\n--- ТАБЛИЦА LOGS ---');
  const { data: logs, error: err2 } = await supabase.from('logs').select('*');
  if (err2) console.error(err2);
  else console.log(JSON.stringify(logs, null, 2));
}
main();
