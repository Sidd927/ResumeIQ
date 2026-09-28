"""Structured parser output. Mirrors frontend/src/types (ParsedResume, ParsedJobDescription).

Every field the parser might fail to find is nullable or an empty list — a
partially parsed resume is a valid result, and the completeness score reports
how much was recovered.
"""

from pydantic import BaseModel, Field


class ContactInfo(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None


class WorkEntry(BaseModel):
    title: str | None = None
    company: str | None = None
    start_date: str | None = Field(default=None, description='"YYYY-MM" or "YYYY"')
    end_date: str | None = Field(default=None, description='"YYYY-MM"/"YYYY"; null = current role (if start_date is set)')
    bullets: list[str] = Field(default_factory=list)


class EducationEntry(BaseModel):
    degree: str | None = None
    institution: str | None = None
    year: int | None = None


class ParsedResume(BaseModel):
    contact_info: ContactInfo = Field(default_factory=ContactInfo)
    work_history: list[WorkEntry] = Field(default_factory=list, description="Most recent role first")
    education: list[EducationEntry] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list, description="Canonical taxonomy names where known")


class ParsedJobDescription(BaseModel):
    title: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    experience_level: str | None = None
    requirements: list[str] = Field(default_factory=list)
