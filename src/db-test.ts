import 'dotenv/config';
import { supabase } from './db/supabase';

async function main() {
  console.log('Вставляем тестового клиента в БД...');
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: 'Иванов Иван',
      email: 'test@example.com',
      password_encrypted: 'test_password',
      schedule_id: '74233394',
      applicant_ids: ['88823596', '88823645'],
      current_date: '2027-08-15',
      status: 'active',
      attempts_left: 3
    })
    .select();

  if (error) {
    console.error('Ошибка вставки:', error);
  } else {
    console.log('Успешная вставка клиента:', data);
  }
}
main();
