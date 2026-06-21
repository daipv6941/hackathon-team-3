import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../packages/hiring/src/backend/db/schema.ts';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'seta',
  password: process.env.DB_PASSWORD || 'seta',
  database: process.env.DB_NAME || 'seta',
});

const db = drizzle(pool, { schema });

const skills = [
  'React,TypeScript,Node.js',
  'Python,Django,PostgreSQL',
  'Java,Spring Boot,Microservices',
  'Vue.js,JavaScript,CSS',
  'Go,Docker,Kubernetes',
  'C++,System Design',
  'Ruby,Rails,MongoDB',
  'Rust,WebAssembly',
  'PHP,Laravel,MySQL',
  'Scala,Spark,Big Data',
];

const companies = [
  'Google',
  'Facebook',
  'Amazon',
  'Microsoft',
  'Apple',
  'Netflix',
  'Tesla',
  'Airbnb',
  'Uber',
  'Stripe',
];

const titles = [
  'Senior Software Engineer',
  'Full Stack Developer',
  'Frontend Engineer',
  'Backend Engineer',
  'DevOps Engineer',
  'Data Engineer',
  'ML Engineer',
  'Solutions Architect',
];

const englishLevels = ['B1', 'B2', 'C1', 'C2'];
const salaryRanges = ['$50k-$70k', '$70k-$90k', '$90k-$120k', '$120k-$150k', '$150k+'];

async function seedCandidates() {
  try {
    console.log('🌱 Seeding 20 test candidates...');

    const candidates = [];
    for (let i = 1; i <= 20; i++) {
      candidates.push({
        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        cv_id: `CV_${String(i).padStart(3, '0')}`,
        candidate_id: `CAND_${String(i).padStart(3, '0')}`,
        full_name: `Candidate ${i}`,
        current_title: titles[i % titles.length],
        current_company: companies[i % companies.length],
        years_of_experience: 2 + (i % 8),
        cv_skills: skills[i % skills.length],
        english_level: englishLevels[i % englishLevels.length],
        salary_expectation: salaryRanges[i % salaryRanges.length],
        status: i % 5 === 0 ? 'inactive' : 'active',
      });
    }

    await db
      .insert(schema.hiringCandidates)
      .values(candidates as any)
      .onConflictDoNothing();

    console.log(`✅ Seeded ${candidates.length} test candidates successfully!`);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await pool.end();
  }
}

seedCandidates();
