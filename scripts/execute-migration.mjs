import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function executeMigration() {
  console.log('🚀 开始执行数据库迁移\n')
  
  // 读取 SQL 文件
  const sqlFile = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve('scripts/017_create_referral_tables.sql')
  const sql = fs.readFileSync(sqlFile, 'utf-8')
  
  console.log('📝 SQL 脚本内容:')
  console.log(sql)
  console.log('\n')
  
  // 执行 SQL
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })
    
    if (error) {
      console.error('❌ 执行失败:', error)
      
      // 尝试逐条执行 SQL 语句
      console.log('\n🔄 尝试逐条执行 SQL 语句...\n')
      
      const statements = sql.split(';').filter(s => s.trim())
      
      for (const statement of statements) {
        if (!statement.trim()) continue
        
        console.log(`执行: ${statement.substring(0, 50)}...`)
        
        try {
          const { error: stmtError } = await supabase.rpc('exec_sql', { 
            sql_query: statement + ';' 
          })
          
          if (stmtError) {
            console.log(`⚠️ 警告: ${stmtError.message}`)
          } else {
            console.log('✅ 成功')
          }
        } catch (e) {
          console.log(`⚠️ 异常: ${e.message}`)
        }
      }
    } else {
      console.log('✅ 迁移执行成功')
      console.log('结果:', data)
    }
  } catch (e) {
    console.error('❌ 执行异常:', e.message)
    console.log('\n💡 提示: 如果 exec_sql RPC 不存在，请在 Supabase SQL 编辑器中手动执行 SQL 脚本')
  }
}

executeMigration()
