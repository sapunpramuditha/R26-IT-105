"""
resume_parser.py
================
Component 1 — Resume Parser Client
Smart Recruiter API

Flow:
    PDF bytes  ──► extract text locally
                   │  ATS-friendly PDF  → pdfplumber (text layer)
                   │  Scanned/image PDF → pytesseract OCR (auto fallback)
                   │  Clean & normalise text
                        │
                        ▼
      POST multipart {"content": "<resume text>", "resume": <pdf bytes>}
                        │
    HuggingFace endpoint (local model + verification pass)
    https://SapunMendis-Resume-Parser.hf.space/analyze
                        │
                        ▼
              structured resume JSON  ──► ScoringEngine

Note: verification/correction now happens server-side (in the HF
Space's app.py + verifier.py), not in this client. This client's
only job is to extract text locally, send both the text AND the original
PDF bytes to the HF endpoint, and normalise whatever comes back.
"""

import io
import re
import logging

import requests

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

try:
    from pdf2image import convert_from_bytes
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

logger = logging.getLogger(__name__)

HF_ENDPOINT     = "https://SapunMendis-Resume-Parser.hf.space/analyze"
REQUEST_TIMEOUT = (10, 300)  # seconds — HF cold starts can be slow


class ResumeParserClient:
    """
    Thin client around the HuggingFace resume-parsing endpoint.

    The PDF text is extracted locally, then BOTH the plain text and the
    original PDF bytes are POSTed (multipart/form-data) to the HF
    endpoint, which runs the local model + a verification pass
    server-side and returns the final corrected JSON.

    If parsing fails for any reason, a graceful fallback with empty
    fields is returned so the rest of the pipeline can still run.
    """

    def __init__(self, endpoint: str = HF_ENDPOINT, timeout: int = REQUEST_TIMEOUT):
        self.endpoint = endpoint
        self.timeout  = timeout

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def parse_from_file(self, pdf_bytes: bytes) -> dict:
        """
        Extract text from PDF bytes, then send BOTH the text and the raw
        PDF bytes to the HF endpoint (which handles model parsing +
        verification internally).

        Parameters
        ----------
        pdf_bytes : bytes   Raw PDF content from multipart upload

        Returns
        -------
        dict  Structured resume data ready for ScoringEngine
        """
        logger.info("[ResumeParser] Extracting text from PDF …")
        text = self._extract_pdf_text(pdf_bytes)

        if not text.strip():
            logger.warning("[ResumeParser] PDF text extraction produced empty result.")
            return self._fallback(error="empty_pdf_text")

        logger.info("[ResumeParser] Extracted %d characters from PDF.", len(text))
        return self._call_hf(text, resume_text=text, pdf_bytes=pdf_bytes)

    def parse_from_text(self, text: str) -> dict:
        """
        Send pre-extracted resume text to the HF endpoint (no PDF
        available in this path — server-side verification falls back to
        text-only mode automatically).

        Parameters
        ----------
        text : str  Plain-text resume content

        Returns
        -------
        dict  Structured resume data
        """
        if not text.strip():
            return self._fallback(error="empty_text_input")
        return self._call_hf(text, resume_text=text, pdf_bytes=None)

    # ------------------------------------------------------------------
    # PDF extraction
    # ------------------------------------------------------------------

    def _extract_pdf_text(self, pdf_bytes: bytes) -> str:
        """
        Extract text from PDF bytes.

        Strategy (auto-detected):
          1. pdfplumber  — for normal/ATS-friendly PDFs with a text layer
          2. pytesseract — OCR fallback for scanned / image-based PDFs

        Returns cleaned plain text, or empty string on failure.

        Install dependencies:
          pip install pdfplumber pdf2image pytesseract pillow
          # Linux / Colab:
          sudo apt-get install -y tesseract-ocr poppler-utils
        """
        if not PDFPLUMBER_AVAILABLE:
            logger.error("[ResumeParser] pdfplumber not installed. Run: pip install pdfplumber")
            return ""

        try:
            if self._has_text_layer(pdf_bytes):
                logger.info("[ResumeParser] Text layer detected → using pdfplumber.")
                raw_text = self._extract_with_pdfplumber(pdf_bytes)
            else:
                logger.info("[ResumeParser] No text layer → falling back to OCR.")
                raw_text = self._extract_with_ocr(pdf_bytes)

            return self._clean_text(raw_text)

        except Exception as e:
            logger.error("[ResumeParser] PDF extraction error: %s", e)
            return ""

    def _has_text_layer(self, pdf_bytes: bytes, min_chars_per_page: int = 50) -> bool:
        """
        Returns True if the PDF has a usable text layer (ATS-friendly),
        False if it is scanned / image-based and needs OCR.
        """
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            total_chars = sum(len((p.extract_text() or "").strip()) for p in pdf.pages)
            avg_chars   = total_chars / max(len(pdf.pages), 1)
        return avg_chars >= min_chars_per_page

    def _extract_with_pdfplumber(self, pdf_bytes: bytes) -> str:
        """Extract text from a text-layer PDF using pdfplumber."""
        pages = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text(x_tolerance=2, y_tolerance=2)
                if text:
                    pages.append(text.strip())
        return "\n\n".join(pages)

    def _extract_with_ocr(self, pdf_bytes: bytes, dpi: int = 300) -> str:
        """Extract text from a scanned PDF using pytesseract OCR."""
        if not OCR_AVAILABLE:
            logger.error(
                "[ResumeParser] OCR dependencies missing. "
                "Run: pip install pdf2image pytesseract  "
                "and: sudo apt-get install -y tesseract-ocr poppler-utils"
            )
            return ""

        images = convert_from_bytes(pdf_bytes, dpi=dpi)
        pages  = []
        for image in images:
            text = pytesseract.image_to_string(image, config="--psm 6 --oem 3")
            if text.strip():
                pages.append(text.strip())
        return "\n\n".join(pages)

    @staticmethod
    def _clean_text(text: str) -> str:
        """
        Normalise unicode characters, remove OCR noise, collapse
        excessive whitespace — so the model receives clean input.

        Also fixes common pdfplumber issues with merged words and
        section headers that lose their spaces:
          "ITINFRASTRUCTURE"         → "IT INFRASTRUCTURE"
          "EDUCATION&CERTIFICATIONS" → "EDUCATION & CERTIFICATIONS"
          "PROFESSIONALEXPERIENCE"   → "PROFESSIONAL EXPERIENCE"
        """
        if not text:
            return ""

        # Normalise unicode punctuation
        text = text.replace("\u2013", "-").replace("\u2014", "-")   # em/en dash
        text = text.replace("\u2018", "'").replace("\u2019", "'")   # curly quotes
        text = text.replace("\u201c", '"').replace("\u201d", '"')
        text = text.replace("\u2022", "-").replace("\u25cf", "-")   # bullets
        text = text.replace("\u00a0", " ")                          # non-breaking space

        # Fix "&" merged into ALL-CAPS section headers:
        # "EDUCATION&CERTIFICATIONS" → "EDUCATION & CERTIFICATIONS"
        text = re.sub(r'([A-Z])&([A-Z])', r'\1 & \2', text)

        # Fix merged CamelCase/TitleCase word boundaries:
        # "TechnicalManager" → "Technical Manager"
        text = re.sub(r'([A-Z]{2,})([A-Z][a-z])', r'\1 \2', text)

        # Fix known fully-uppercase merged section headers
        _SECTION_FIXES = {
            'PROFESSIONALEXPERIENCE': 'PROFESSIONAL EXPERIENCE',
            'WORKEXPERIENCE':         'WORK EXPERIENCE',
            'SELECTACHIEVEMENTS':     'SELECT ACHIEVEMENTS',
            'KEYACHIEVEMENTS':        'KEY ACHIEVEMENTS',
            'ITINFRASTRUCTURE':       'IT INFRASTRUCTURE',
            'TECHNICALSKILLS':        'TECHNICAL SKILLS',
            'KEYSKILLS':              'KEY SKILLS',
            'CORECOMPETENCIES':       'CORE COMPETENCIES',
            'CAREERHISTORY':          'CAREER HISTORY',
            'CAREEROBJECTIVE':        'CAREER OBJECTIVE',
            'STATEUNIVERSITY':        'STATE UNIVERSITY',
        }
        for merged, fixed in _SECTION_FIXES.items():
            text = text.replace(merged, fixed)

        # Remove non-printable characters (OCR artifacts)
        text = re.sub(r'[^\x20-\x7E\n]', ' ', text)

        # Remove repeated separator lines (e.g. "------", "......")
        text = re.sub(r'[.\-_=]{4,}', ' ', text)

        # Collapse multiple spaces/tabs into one
        text = re.sub(r'[ \t]+', ' ', text)

        # Collapse more than 2 consecutive blank lines
        text = re.sub(r'\n{3,}', '\n\n', text)

        # Strip leading/trailing whitespace per line
        lines = [line.strip() for line in text.splitlines()]
        return "\n".join(lines).strip()

    # ------------------------------------------------------------------
    # HuggingFace API call
    # ------------------------------------------------------------------

    def _call_hf(self, text: str, resume_text: str = "", pdf_bytes: bytes = None) -> dict:
        """
        POST the resume text (and, when available, the original PDF
        bytes) to the HuggingFace endpoint.

        The HF Space runs the local model AND the verification
        pass server-side, so whatever JSON comes back is already final.

        Sends multipart/form-data:
            content : "<resume text>"          (always)
            resume  : <pdf bytes>               (only when available)
        Expects back: structured resume JSON (already verified server-side)
        """
        logger.info("[ResumeParser] Calling HuggingFace endpoint (pdf=%s) …", pdf_bytes is not None)
        try:
            files = None
            if pdf_bytes:
                files = {"resume": ("resume.pdf", pdf_bytes, "application/pdf")}

            resp = requests.post(
                self.endpoint,
                data={"content": text},
                files=files,
                timeout=self.timeout,
            )
            resp.raise_for_status()
            raw = resp.json()
            logger.info("[ResumeParser] HF parse successful. parser_source=%s", raw.get("parser_source"))
            return self._normalise(raw, resume_text=resume_text)

        except requests.exceptions.Timeout:
            logger.error("[ResumeParser] Request timed out after %ds.", self.timeout)
            return self._fallback(error="timeout")

        except requests.exceptions.HTTPError as e:
            logger.error("[ResumeParser] HTTP error: %s", e)
            return self._fallback(error=str(e))

        except Exception as e:
            logger.error("[ResumeParser] Unexpected error: %s", e)
            return self._fallback(error=str(e))

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _normalise(self, raw: dict, resume_text: str = "") -> dict:
        """
        Normalise the HuggingFace model output into the schema expected
        by ScoringEngine._score_resume().

        For any field the model omits (name, education, projects),
        post-processing regex fallbacks extract the value directly
        from the raw resume text.
        """
        experience_list = raw.get("experience") or []

        # ── Model outputs ────────────────────────────────────────────────
        name           = (raw.get("name") or raw.get("candidate_name")
                          or raw.get("full_name") or "")
        education      = raw.get("education") or []
        projects       = self._to_list(
                            raw.get("projects") or raw.get("project_titles") or [])
        certifications = self._to_list(raw.get("certifications") or [])

        # ── Post-processing fallbacks (only when model missed the field) ─
        if resume_text:
            if not name:
                name = self._fallback_extract_name(resume_text)
            if not education:
                education = self._fallback_extract_education(resume_text)
            if not projects:
                projects = self._fallback_extract_projects(resume_text)

        return {
            "name":                   name,
            "skills":                 self._to_list(
                                          raw.get("skills") or
                                          raw.get("technical_skills") or []),
            "programming_languages":  self._to_list(
                                          raw.get("programming_languages") or []),
            "total_experience_years": self._calc_experience_years(experience_list),
            "experience":             experience_list,
            "education":              education,
            "certifications":         certifications,
            "projects":               projects,
            "publications":           self._to_list(raw.get("publications") or []),
            "achievements":           self._to_list(raw.get("achievements")  or []),
            "parser_source":          raw.get("parser_source", "huggingface"),
            "raw_parser_response":    raw,
        }

    # ------------------------------------------------------------------
    # Post-processing fallback extractors
    # ------------------------------------------------------------------

    @staticmethod
    def _fallback_extract_name(text: str) -> str:
        """
        Extract candidate name from the first line of the resume.
        Handles all-caps, title case, and names with credentials.
        e.g. "KARAN PRATAP SINGH"  → "Karan Pratap Singh"
             "PRIYA SILVA, B.Eng"  → "Priya Silva"
             "Maria A. Garcia"     → "Maria A. Garcia"
        """
        first_line = text.strip().splitlines()[0].strip()
        lines = [l.strip() for l in text.strip().splitlines() if l.strip()]

        def clean_name_candidate(raw):
            # Strip after pipe, comma, email, phone or credential suffixes
            raw = re.split(r'[|,]', raw)[0].strip()
            # Remove trailing credentials like "M.ENG.", "PhD", "MBA"
            raw = re.sub(r'\s*[,\|]\s*.*$', '', raw).strip()
            return raw

        # Try first line
        name_part = clean_name_candidate(lines[0])
        if re.match(r'^[A-Z][a-zA-Z\s\-\.]{2,50}$', name_part) and len(name_part.split()) >= 2:
            return name_part.title() if name_part.isupper() else name_part

        # Try combining first two lines (two-column PDF — name split across lines)
        if len(lines) >= 2:
            combined = clean_name_candidate(lines[0] + " " + lines[1])
            if re.match(r'^[A-Z][a-zA-Z\s\-\.]{2,50}$', combined) and len(combined.split()) >= 2:
                return combined.title() if combined.isupper() else combined

        # Fallback: first line even if single word
        if re.match(r'^[A-Z][a-zA-Z\s\-\.]{2,50}$', name_part):
            return name_part.title() if name_part.isupper() else name_part
        return ""

    @staticmethod
    def _fallback_extract_education(text: str) -> list:
        """
        Extract education entries from the EDUCATION section.
        Handles formats:
          Format A: "BSc CS, University of X 2020"       (inline institution)
          Format B: "BSc CS 2018-2022 \\n SLIIT City"    (institution next line)
          Format C: "BSc CS \\n University \\n 2020"      (year on own line)
          Multiple degrees on consecutive lines.
        """
        # Stop at known section headers only — not at every line starting with 3 uppercase letters
        # (which would wrongly stop at "SRM Institute..." or "NSBM Green University...")
        _SECTION_STOP = (r'(?=\n(?:EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|'
                         r'SKILLS|TECHNICAL SKILLS|PROJECTS|FREELANCING|PUBLICATIONS|'
                         r'ACHIEVEMENTS|CERTIFICATIONS|REFERENCES|SUMMARY|OBJECTIVE|'
                         r'CAREER|AWARDS|INTERESTS|LANGUAGES|VOLUNTEER)[\s\n]|$)')

        edu_section = re.search(
            r'EDUCATION(?:\s*[&/]\s*[\w\s]+)?\s*\n(.*?)' + _SECTION_STOP,
            text, re.IGNORECASE | re.DOTALL
        )
        if not edu_section:
            return []

        lines = [l.strip() for l in edu_section.group(1).splitlines() if l.strip()]

        DEGREE_KEYWORDS = [
            'bachelor', 'master', 'phd', 'doctorate', 'bsc', 'msc', 'mba',
            'b.tech', 'b.e', 'm.tech', 'diploma', 'associate', 'b.s', 'm.s',
            'honours', 'hons', 'b.eng', 'm.eng', 'b.sc', 'm.sc', 'hnd',
            'beng', 'meng', 'gce', 'a/l',
        ]
        # 'engineering' and 'sciences' intentionally excluded —
        # they appear in field-of-study strings like "Computer Science and Engineering"
        INST_ENDINGS  = ['university', 'universities', 'institute', 'institution',
                         'college', 'school', 'academy', 'polytechnic', 'faculty',
                         'technology', 'technologies']
        INST_ACRONYMS = {'sliit', 'mit', 'nsbm', 'iit', 'nit', 'bits', 'vit',
                         'lpu', 'pearson'}
        DEGREE_STARTS = ['bsc', 'msc', 'beng', 'meng', 'b.sc', 'm.sc', 'b.eng',
                         'm.eng', 'hnd', 'phd', 'mba', 'bachelor', 'master',
                         'diploma', 'gce', 'a/l', 'associate', 'honours']

        def is_institution_line(line):
            ll = line.lower().strip()
            # Reject lines that start with a degree abbreviation
            if any(ll.startswith(d) for d in DEGREE_STARTS):
                return False
            return (any(kw in ll for kw in INST_ENDINGS) or
                    any(ll.startswith(ac) for ac in INST_ACRONYMS) or
                    ll in INST_ACRONYMS)

        def is_year_line(line):
            return bool(re.match(r'^\d{4}\s*[-–]?\s*(\d{4}|present)?$',
                                 line.strip(), re.IGNORECASE))

        def extract_inline_institution(line):
            """
            Extract institution from inline patterns like:
              "HND in Software Engineering - Pearson (2020-2022)"
              → institution = "Pearson", year = 2022
            Returns (institution, year) or ("", None)
            """
            # Pattern: "Degree - Institution (year)" or "Degree - Institution year-year"
            m = re.search(r'[-–]\s*([A-Z][^\d\n(]+?)\s*(?:\((\d{4})[-–]\d{4}\)|(\d{4})[-–]\d{4})', line)
            if m:
                inst_raw = m.group(1).strip().rstrip('.,')
                yr_str   = m.group(2) or m.group(3)
                year     = int(yr_str) if yr_str else None
                return inst_raw, year
            return "", None

        results = []
        i = 0
        while i < len(lines):
            line = lines[i]

            # ── Format A: institution line BEFORE degree (two-column PDFs) ──
            # e.g. "London Metropolitan University - March 2023 - February 2024"
            #      "BEng (Hons) Software Engineering (First class honours)"
            if is_institution_line(line) and (i + 1) < len(lines):
                nxt = lines[i + 1]
                if any(kw in nxt.lower() for kw in DEGREE_KEYWORDS):
                    institution = ResumeParserClient._extract_institution_name(line)
                    yr = re.search(r'\b(20\d{2}|19\d{2})\b', line)
                    grad_year = int(yr.group(1)) if yr else None
                    degree_line = re.sub(r'\s+Overall\s+\w+$', '', nxt, flags=re.IGNORECASE).strip()
                    results.append({
                        "degree":      degree_line,
                        "field":       None,
                        "institution": institution,
                        "year":        grad_year,
                    })
                    i += 2
                    continue

            # ── Format B: degree line with optional inline institution ───────
            if any(kw in line.lower() for kw in DEGREE_KEYWORDS):
                year_match  = re.search(r'(\d{4})\s*[-–]\s*(\d{4}|\bpresent\b)', line, re.IGNORECASE)
                single_year = re.search(r'\b(20\d{2}|19\d{2})\b\s*$', line)
                grad_year   = None

                if year_match:
                    end = year_match.group(2)
                    grad_year = int(end) if end.isdigit() else None
                    line = line[:year_match.start()].strip()
                elif single_year:
                    grad_year = int(single_year.group(1))
                    line = line[:single_year.start()].strip()

                # Check for inline institution after dash:
                # "HND in Software Engineering - Pearson (2020-2022)"
                inline_inst, inline_yr = extract_inline_institution(lines[i])
                if inline_inst:
                    # Strip the "- Institution (year)" part from degree
                    degree_clean = re.sub(r'\s*[-–]\s*' + re.escape(inline_inst) + r'.*$',
                                          '', lines[i]).strip()
                    degree_clean = re.sub(r'\s*[-–]\s*\w+\s+\(\d{4}[-–]\d{4}\).*$',
                                          '', degree_clean).strip()
                    results.append({
                        "degree":      degree_clean,
                        "field":       None,
                        "institution": inline_inst,
                        "year":        inline_yr or grad_year,
                    })
                    i += 1
                    continue

                # Split by comma for degree / field / inline institution
                parts       = [p.strip() for p in line.split(',')]
                degree      = parts[0]
                field       = ""
                institution = ""

                if len(parts) >= 2:
                    last = parts[-1].strip()
                    if is_institution_line(last):
                        institution = ResumeParserClient._extract_institution_name(last)
                        field = parts[1] if len(parts) >= 3 else ""
                    else:
                        field = parts[1] if len(parts) > 1 else ""

                # Look at following lines for institution / year
                j = i + 1
                while j < len(lines) and not institution:
                    nxt = lines[j]
                    if is_year_line(nxt):
                        if not grad_year:
                            yr = re.search(r'\b(20\d{2}|19\d{2})\b', nxt)
                            if yr: grad_year = int(yr.group(1))
                        j += 1
                    elif is_institution_line(nxt):
                        institution = ResumeParserClient._extract_institution_name(nxt)
                        j += 1
                        break
                    else:
                        break

                i = j - 1 if j > i + 1 else i
                results.append({
                    "degree":      degree,
                    "field":       field or None,
                    "institution": institution or None,
                    "year":        grad_year,
                })
            i += 1

        return results

    @staticmethod
    def _fallback_extract_projects(text: str) -> list:
        """
        Extract project names from the PROJECTS section.
        Handles bullet styles (•, -, *, ›), colon separators, and plain lines.
        Returns just the project name (text before dash/colon description).
        """
        _SECTION_STOP = (r'(?=\n(?:EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|'
                         r'SKILLS|TECHNICAL SKILLS|EDUCATION|PUBLICATIONS|'
                         r'ACHIEVEMENTS|CERTIFICATIONS|REFERENCES|SUMMARY|OBJECTIVE|'
                         r'CAREER|AWARDS|INTERESTS|LANGUAGES|VOLUNTEER)[\s\n]|$)')

        proj_section = re.search(
            r'(?:FREELANCING\s+)?PROJECTS?\s*\n(.*?)' + _SECTION_STOP,
            text, re.IGNORECASE | re.DOTALL
        )
        if not proj_section:
            return []

        raw_lines = proj_section.group(1).splitlines()
        has_bullets = any(
            re.match(r'^[•\-\*›▪▸]', l.strip()) for l in raw_lines if l.strip()
        )

        bullets, current = [], ""

        if has_bullets:
            # Join continuation lines into their parent bullet
            for line in raw_lines:
                line = line.strip()
                if not line:
                    continue
                if re.match(r'^[•\-\*›▪▸]', line):
                    if current: bullets.append(current)
                    current = re.sub(r'^[•\-\*›▪▸]\s*', '', line)
                elif current:
                    current += " " + line
            if current: bullets.append(current)
        else:
            # No bullets — each non-empty line is a project entry
            bullets = [l.strip() for l in raw_lines if l.strip()]

        projects = []
        for b in bullets:
            # "SYSCONEX co-founder 2024 May to 2024 December" → "SYSCONEX co-founder"
            year_in_middle = re.search(r'\s+\d{4}\s+\w+', b)
            if year_in_middle:
                projects.append(b[:year_in_middle.start()].strip())
                continue
            # "Name - description" or "Name: description"
            m = re.match(r'^(.+?)\s*[-–:]\s*.+', b)
            if m:
                projects.append(m.group(1).strip())
                continue
            # No separator — take first 1-3 words as project name
            # (handles "PaymentGateway API open source..." → "PaymentGateway API")
            words = b.split()
            if len(words) <= 3:
                projects.append(b.strip())
            else:
                # Take up to first 3 words if they look like a name (title-case or camelcase)
                name_words = []
                for w in words:
                    if w[0].isupper() or w[0].isdigit():
                        name_words.append(w)
                    else:
                        break
                projects.append(' '.join(name_words) if name_words else words[0])

        return [p for p in projects if len(p) > 1]

    @staticmethod
    def _extract_institution_name(raw_inst: str) -> str:
        """
        Extract institution name from a line that may contain
        trailing location, year, or other noise.

        Examples:
          "SRM Institute of Science and Technology Delhi NCR, India"
            → "SRM Institute of Science and Technology"
          "Stanford University 2019"
            → "Stanford University"
          "NIBM Colombo, Sri Lanka"
            → "NIBM"
          "Khalifa University, Abu Dhabi, UAE"
            → "Khalifa University"
        """
        # Strip trailing year (e.g. "Stanford University 2019")
        raw_inst = re.sub(r'\s+\b(19|20)\d{2}\b\s*$', '', raw_inst).strip()

        # Double-space split — PDF column alignment artifact
        if '  ' in raw_inst:
            return raw_inst.split('  ')[0].strip()

        INST_ENDINGS = [
            'technology', 'technologies', 'university', 'universities',
            'institute', 'institution', 'college', 'school', 'academy',
            'polytechnic', 'faculty', 'sciences', 'engineering',
        ]
        INST_ACRONYMS = {
            'sliit', 'mit', 'nsbm', 'iit', 'nit', 'bits', 'vit', 'lpu',
            'nibm', 'iisc', 'nus', 'ntu', 'uom', 'ucl', 'eth',
        }
        CONNECTORS = {'of', 'and', 'the', 'for', 'in', 'at', '&', 'de', 'la'}

        tokens    = raw_inst.split()
        raw_lower = raw_inst.lower()

        # Standalone acronym: only when no inst_ending keyword in line
        if (tokens and tokens[0].lower() in INST_ACRONYMS and
                not any(kw in raw_lower for kw in INST_ENDINGS)):
            return tokens[0]

        # Find last institution keyword token, then extend through connectors
        best_end = -1
        for i, tok in enumerate(tokens):
            if tok.lower().rstrip('.,') in INST_ENDINGS:
                best_end = i

        if best_end >= 0:
            end = best_end + 1
            while end < len(tokens):
                if tokens[end].lower() in CONNECTORS and end + 1 < len(tokens):
                    end += 2
                else:
                    break
            return ' '.join(tokens[:end]).strip()

        # Fallback: strip after last comma
        comma_idx = raw_inst.rfind(',')
        return raw_inst[:comma_idx].strip() if comma_idx > 0 else raw_inst.strip()

    @staticmethod
    def _calc_experience_years(experience_list: list) -> float:
        """
        Calculate total years of experience from a list of job entries.
        Handles overlapping date ranges by merging intervals.
        """
        from datetime import datetime

        def parse_date(date_str: str):
            if not date_str:
                return None
            date_str = date_str.strip()
            if date_str.lower() == "present":
                return datetime.today()
            for fmt in ("%m/%d/%Y", "%m/%Y", "%B %Y", "%b %Y",
                        "%B %d, %Y", "%b %d, %Y", "%Y-%m-%d", "%Y"):
                try:
                    return datetime.strptime(date_str, fmt)
                except ValueError:
                    continue
            return None

        intervals = []
        for job in experience_list:
            start = parse_date(job.get("start_date", ""))
            end   = parse_date(job.get("end_date", ""))
            if start and end and end >= start:
                intervals.append((start, end))

        if not intervals:
            return 0.0

        intervals.sort(key=lambda x: x[0])
        merged = [intervals[0]]
        for start, end in intervals[1:]:
            if start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], end))
            else:
                merged.append((start, end))

        total_days = sum((end - start).days for start, end in merged)
        return round(total_days / 365.25, 1)

    @staticmethod
    def _to_list(value) -> list:
        """Ensure value is always a list."""
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
        return []

    @staticmethod
    def _fallback(error: str = "unknown") -> dict:
        """
        Return a minimal valid dict so the pipeline can still run
        using only GitHub + graph signals.
        """
        logger.warning("[ResumeParser] Using fallback empty resume data (error: %s)", error)
        return {
            "name": "",
            "skills": [],
            "programming_languages": [],
            "total_experience_years": 0,
            "education": [],
            "certifications": [],
            "projects": [],
            "parser_error": error,
            "parser_source": "none",
        }