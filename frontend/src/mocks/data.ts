/**
 * Single source of truth for all Phase 1 mock data.
 *
 * Every object is typed against src/types (which mirror the backend Pydantic
 * schemas), so swapping in real API responses in Phase 3 is a drop-in change.
 *
 * Internal consistency rules (keep these true when editing):
 * - composite_score = (0.4·skill + 0.3·semantic + 0.2·recency + 0.1·completeness) × 100
 * - missing_skills  = JD required/preferred skills not present in resume skills
 */
import type {
  JobDescriptionResponse,
  MatchResponse,
  ParsedJobDescription,
  ParsedResume,
  ResumeResponse,
} from '../types';

// === Resume ===

export const mockParsedResume: ParsedResume = {
  contact_info: {
    name: 'Siddhant Patil',
    email: 'siddhant@example.com',
    phone: '+91 98765 43210',
    location: 'Mumbai, India',
  },
  work_history: [
    {
      title: 'Full Stack Developer',
      company: 'TechCorp Solutions',
      start_date: '2024-06',
      end_date: null, // current role
      bullets: [
        'Built and deployed microservices using FastAPI and PostgreSQL, handling 10K+ daily requests',
        'Developed responsive React dashboards with TypeScript, reducing page load times by 40%',
        'Implemented CI/CD pipelines using GitHub Actions, cutting deployment time from 2 hours to 15 minutes',
        'Collaborated with a cross-functional team of 8 to deliver features on a 2-week sprint cycle',
      ],
    },
    {
      title: 'Software Engineering Intern',
      company: 'DataFlow Analytics',
      start_date: '2023-01',
      end_date: '2024-05',
      bullets: [
        'Designed REST APIs serving ML model predictions to 50+ enterprise clients',
        'Created data visualization components using Recharts, adopted across 3 product teams',
        'Wrote unit and integration tests achieving 85% code coverage on critical services',
      ],
    },
  ],
  education: [
    {
      degree: 'B.Tech Computer Science',
      institution: 'Mumbai University',
      year: 2025,
    },
  ],
  // "CI/CD" is backed by the GitHub Actions bullet above; it is what makes
  // the JD-1 missing list exactly [Node.js, AWS] + 3 preferred skills.
  skills: [
    'Python',
    'JavaScript',
    'TypeScript',
    'React',
    'FastAPI',
    'PostgreSQL',
    'Docker',
    'Git',
    'REST APIs',
    'CI/CD',
    'Tailwind CSS',
  ],
};

export const mockResume: ResumeResponse = {
  id: 1,
  user_id: 1,
  raw_text: 'Siddhant Patil — Full Stack Developer …',
  parsed_json: mockParsedResume,
  file_url: null,
  created_at: '2026-09-20T08:00:00Z',
};

// === Job descriptions ===

export const mockJobDescription: ParsedJobDescription = {
  title: 'Senior Full Stack Developer',
  required_skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'AWS', 'CI/CD', 'REST APIs'],
  preferred_skills: ['Python', 'FastAPI', 'Redis', 'GraphQL', 'Kubernetes'],
  experience_level: '3-5 years',
  requirements: [
    'Build and maintain scalable web applications using React and Node.js',
    'Design and implement RESTful APIs with proper authentication and authorization',
    'Write clean, testable code with comprehensive unit and integration tests',
    'Deploy and manage applications on AWS using containerized architectures',
    'Collaborate with product managers and designers in an agile environment',
  ],
};

/** Raw text for the "Use sample job description" shortcut on the dashboard. */
export const mockJobDescriptionRawText = `Senior Full Stack Developer — 3-5 years

We're looking for a Senior Full Stack Developer to build and scale our core product.

What you'll do:
• Build and maintain scalable web applications using React and Node.js
• Design and implement RESTful APIs with proper authentication and authorization
• Write clean, testable code with comprehensive unit and integration tests
• Deploy and manage applications on AWS using containerized architectures
• Collaborate with product managers and designers in an agile environment

Required: React, TypeScript, Node.js, PostgreSQL, Docker, AWS, CI/CD, REST APIs
Nice to have: Python, FastAPI, Redis, GraphQL, Kubernetes`;

/** Every JD referenced by mock match history, keyed by jd_id. */
export const mockJobDescriptions: Record<number, JobDescriptionResponse> = {
  1: {
    id: 1,
    user_id: 1,
    raw_text: mockJobDescriptionRawText,
    parsed_json: mockJobDescription,
    created_at: '2026-09-28T10:29:00Z',
  },
  2: {
    id: 2,
    user_id: 1,
    raw_text: 'Full Stack Engineer (Python / React) …',
    parsed_json: {
      title: 'Full Stack Engineer (Python / React)',
      required_skills: ['Python', 'FastAPI', 'React', 'TypeScript', 'PostgreSQL', 'Kubernetes'],
      preferred_skills: ['Docker', 'Terraform'],
      experience_level: '1-3 years',
      requirements: [
        'Ship end-to-end features across a FastAPI backend and React frontend',
        'Own services running on Kubernetes in production',
      ],
    },
    created_at: '2026-09-27T14:14:00Z',
  },
  3: {
    id: 3,
    user_id: 1,
    raw_text: 'Backend Engineer — Java Platform …',
    parsed_json: {
      title: 'Backend Engineer — Java Platform',
      required_skills: ['Java', 'Spring Boot', 'Kafka', 'Microservices', 'SQL'],
      preferred_skills: ['Oracle Database', 'Jenkins', 'Docker'],
      experience_level: '3-5 years',
      requirements: [
        'Design event-driven microservices with Spring Boot and Kafka',
        'Maintain CI pipelines in Jenkins',
      ],
    },
    created_at: '2026-09-25T08:59:00Z',
  },
  4: {
    id: 4,
    user_id: 1,
    raw_text: 'Frontend Engineer, React …',
    parsed_json: {
      title: 'Frontend Engineer, React',
      required_skills: ['React', 'TypeScript', 'JavaScript', 'REST APIs', 'Git'],
      preferred_skills: ['Tailwind CSS', 'Redis'],
      experience_level: '1-3 years',
      requirements: [
        'Build accessible, responsive interfaces in React and TypeScript',
        'Integrate with REST APIs and own frontend performance',
      ],
    },
    created_at: '2026-09-22T16:44:00Z',
  },
};

// === Match results ===

// 0.4·72 + 0.3·81 + 0.2·65 + 0.1·95 = 28.8 + 24.3 + 13.0 + 9.5 = 75.6
export const mockMatchResult: MatchResponse = {
  id: 1,
  resume_id: 1,
  jd_id: 1,
  skill_score: 0.72, // has 6/8 required skills — missing Node.js and AWS
  semantic_score: 0.81, // bullets semantically cover most JD requirements
  recency_score: 0.65, // current title "Full Stack Developer" vs "Senior …"
  completeness_score: 0.95, // all sections parsed cleanly
  composite_score: 75.6,
  missing_skills: ['Node.js', 'AWS', 'GraphQL', 'Kubernetes', 'Redis'],
  feedback_text: null, // AI feedback is a stretch goal
  created_at: '2026-09-28T10:30:00Z',
};

export const mockMatchHistory: MatchResponse[] = [
  mockMatchResult,
  {
    // 35.2 + 22.5 + 18.0 + 9.5 = 85.2
    id: 2,
    resume_id: 1,
    jd_id: 2,
    skill_score: 0.88,
    semantic_score: 0.75,
    recency_score: 0.9,
    completeness_score: 0.95,
    composite_score: 85.2,
    missing_skills: ['Kubernetes', 'Terraform'],
    feedback_text: null,
    created_at: '2026-09-27T14:15:00Z',
  },
  {
    // 22.0 + 18.6 + 8.0 + 9.5 = 58.1
    id: 3,
    resume_id: 1,
    jd_id: 3,
    skill_score: 0.55,
    semantic_score: 0.62,
    recency_score: 0.4,
    completeness_score: 0.95,
    composite_score: 58.1,
    missing_skills: ['Java', 'Spring Boot', 'Kafka', 'Microservices', 'Oracle Database', 'Jenkins'],
    feedback_text: null,
    created_at: '2026-09-25T09:00:00Z',
  },
  {
    // 36.8 + 26.4 + 17.0 + 9.5 = 89.7
    id: 4,
    resume_id: 1,
    jd_id: 4,
    skill_score: 0.92,
    semantic_score: 0.88,
    recency_score: 0.85,
    completeness_score: 0.95,
    composite_score: 89.7,
    missing_skills: ['Redis'],
    feedback_text: null,
    created_at: '2026-09-22T16:45:00Z',
  },
];
