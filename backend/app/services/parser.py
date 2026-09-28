"""
Resume & JD Parsing Service

Responsibilities:
- Extract raw text from PDF (pdfplumber) and DOCX (python-docx)
- Run spaCy NER to extract structured fields:
  - contact_info: {name, email, phone, location}
  - work_history: [{title, company, start_date, end_date, bullets}]
  - education: [{degree, institution, year}]
  - skills: [str]
- Parse JD into: {title, required_skills, preferred_skills, experience_level, requirements}

Implementation: Phase 2
"""
