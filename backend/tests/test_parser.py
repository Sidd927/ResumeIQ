import pytest

from app.services.parser import (
    ResumeParseError,
    extract_text,
    find_date_range,
    parse_job_description,
    parse_resume,
    parse_resume_text,
)

# ═══════════════════════════════ Job descriptions ════════════════════════════


class TestParseJobDescription:
    def test_realistic_jd(self, sample_jd_text):
        jd = parse_job_description(sample_jd_text)
        assert jd["title"] == "Senior Full Stack Developer"
        assert jd["required_skills"] == [
            "React",
            "TypeScript",
            "Node.js",
            "PostgreSQL",
            "Docker",
            "AWS",
            "CI/CD",
            "REST APIs",
        ]
        assert jd["preferred_skills"] == ["Python", "FastAPI", "Redis", "GraphQL", "Kubernetes"]
        assert jd["experience_level"] == "3-5 years"
        assert len(jd["requirements"]) == 5
        assert jd["requirements"][0] == "Build and maintain scalable web applications using React and Node.js"

    def test_standalone_headers_and_inline_cues(self):
        text = """Job Title: Backend Engineer (Remote)
Acme Corp is hiring.

Requirements
- 5+ years of experience building APIs in Python or Go
- Strong knowledge of PostgreSQL and Redis
- Experience with Kubernetes is a plus

Nice to have
- Terraform, GraphQL
"""
        jd = parse_job_description(text)
        assert jd["title"] == "Backend Engineer"
        assert jd["experience_level"] == "5+ years"
        assert {"Python", "PostgreSQL", "Redis"} <= set(jd["required_skills"])
        assert "Kubernetes" in jd["preferred_skills"]  # inline "is a plus" cue
        assert {"Terraform", "GraphQL"} <= set(jd["preferred_skills"])
        assert not set(jd["required_skills"]) & set(jd["preferred_skills"])

    def test_minimal_jd_without_sections(self):
        jd = parse_job_description(
            "Python developer needed. You must know Django and have at least 2 years experience."
        )
        assert jd["required_skills"] == ["Python", "Django"]
        assert jd["preferred_skills"] == []
        assert jd["experience_level"] == "2+ years"
        assert jd["requirements"]  # falls back to sentences

    @pytest.mark.parametrize("text", ["", "   \n\n  ", "!!!"])
    def test_empty_or_junk_text_does_not_crash(self, text):
        jd = parse_job_description(text)
        assert jd["required_skills"] == [] and jd["preferred_skills"] == []
        assert jd["experience_level"] is None


# ══════════════════════════════════ Dates ════════════════════════════════════


@pytest.mark.parametrize(
    "line, start, end",
    [
        ("Jan 2023 - Present", "2023-01", None),
        ("June 2021 – December 2023", "2021-06", "2023-12"),
        ("2022-2024", "2022", "2024"),
        ("Sept 2020 to Mar 2022", "2020-09", "2022-03"),
        ("03/2019 — 11/2020", "2019-03", "2020-11"),
        ("Acme Corp | 2021-06 – Current", "2021-06", None),
        ("Summer Intern, May 2022", "2022-05", "2022-05"),
    ],
)
def test_date_ranges(line, start, end):
    found = find_date_range(line)
    assert found is not None
    assert (found.start, found.end) == (start, end)


def test_line_without_dates():
    assert find_date_range("Built dashboards used by 3 teams") is None


# ══════════════════════════════════ Resumes ══════════════════════════════════


def _check_sample_resume(parsed: dict) -> None:
    contact = parsed["contact_info"]
    assert contact == {
        "name": "Siddhant Patil",
        "email": "siddhant@example.com",
        "phone": "+91 98765 43210",
        "location": "Mumbai, India",
    }
    roles = parsed["work_history"]
    assert [(r["title"], r["company"], r["start_date"], r["end_date"]) for r in roles] == [
        ("Full Stack Developer", "TechCorp Solutions", "2024-06", None),
        ("Software Engineering Intern", "DataFlow Analytics", "2023-01", "2024-05"),
    ]
    assert len(roles[0]["bullets"]) == 4
    # A bullet that wrapped onto two lines is re-joined.
    assert roles[0]["bullets"][2].endswith("from 2 hours to 15 minutes")
    assert parsed["education"] == [
        {"degree": "B.Tech Computer Science", "institution": "Mumbai University", "year": 2025}
    ]
    skills = parsed["skills"]
    assert {"Python", "React", "FastAPI", "TailwindCSS", "Docker", "CI/CD"} <= set(skills)
    assert "Figma" in skills  # unknown to the taxonomy, kept rather than dropped


def test_parse_resume_text(fixture_bytes):
    _check_sample_resume(parse_resume_text(fixture_bytes("sample_resume.txt").decode("utf-8")))


@pytest.mark.parametrize("filename", ["sample_resume.pdf", "sample_resume.docx"])
def test_parse_real_files(fixture_bytes, filename):
    _check_sample_resume(parse_resume(fixture_bytes(filename), filename))


def test_roles_are_sorted_most_recent_first():
    text = """EXPERIENCE
Junior Developer, OldCo
2018 - 2020
• Maintained legacy PHP code
Senior Developer at NewCo
2021 - Present
• Led a team of five engineers
"""
    roles = parse_resume_text(text)["work_history"]
    assert [r["company"] for r in roles] == ["NewCo", "OldCo"]


@pytest.mark.parametrize(
    "text",
    ["", "hello", "EXPERIENCE\n\nEDUCATION\n\nSKILLS", "@@@ ### $$$\n" * 20, "•\n•\n• \n2020 - 2021"],
)
def test_messy_resume_text_degrades_gracefully(text):
    parsed = parse_resume_text(text)
    assert set(parsed) == {"contact_info", "work_history", "education", "skills"}
    assert isinstance(parsed["work_history"], list)


class TestExtractText:
    def test_unsupported_extension(self):
        with pytest.raises(ResumeParseError, match="PDF or DOCX"):
            extract_text(b"hello", "resume.txt")

    def test_renamed_file_is_rejected(self):
        with pytest.raises(ResumeParseError, match="not a PDF"):
            extract_text(b"PK\x03\x04 actually a zip", "resume.pdf")

    def test_corrupt_pdf(self):
        with pytest.raises(ResumeParseError):
            extract_text(b"%PDF-1.4 garbage garbage", "resume.pdf")

    def test_corrupt_docx(self):
        with pytest.raises(ResumeParseError):
            extract_text(b"PK\x03\x04 not really a docx", "resume.docx")
