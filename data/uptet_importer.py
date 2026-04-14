#!/usr/bin/env python3
"""
UPTET Question Bank — Universal Smart Importer
================================================
One script that does everything:
  1. Seeds exam / paper / session
  2. Seeds subjects (from config)
  3. Auto-discovers and seeds chapters / topics / subtopics from JSON
  4. Inserts all questions with correct FK links
  5. Handles tags
  6. Works for UPTET today, CTET/HTET tomorrow — just add exam config

APOSTROPHE SAFE: Uses psycopg2 parameterized queries throughout.
                 Never string-interpolates user data into SQL.

Usage:
  pip install psycopg2-binary python-dotenv
  
  export DATABASE_URL="postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres"
  
  # Import single file
  python uptet_importer.py 2014_p1.json
  
  # Import multiple files (all years at once)
  python uptet_importer.py 2014_p1.json 2019_p1.json 2022_p1.json
  
  # Import for a different exam (future use)
  python uptet_importer.py --exam CTET ctet_2023_p1.json
"""

import json
import sys
import re
import os
import argparse
import psycopg2
import psycopg2.extras
from collections import defaultdict
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ─────────────────────────────────────────────────────────────────────────────
# EXAM CONFIGS — Add new exams here, nothing else changes
# ─────────────────────────────────────────────────────────────────────────────
EXAM_CONFIGS = {
    "UPTET": {
        "name_en": "Uttar Pradesh Teacher Eligibility Test",
        "name_hi": "उत्तर प्रदेश शिक्षक पात्रता परीक्षा",
        "state": "Uttar Pradesh",
        "conducting_body": "UPMSP",
        "papers": {
            1: {
                "name_en": "Paper 1 (Class I-V)",
                "name_hi": "पेपर 1 (कक्षा I-V)",
                "total_questions": 150,
                "duration_mins": 150,
                "subjects": [
                    # (code, name_en,                    name_hi,                           q_count, sort, is_optional)
                    ("CDP",      "Child Development & Pedagogy", "बाल विकास एवं शिक्षण विधि",   30, 1, False),
                    ("Hindi",    "Language I: Hindi",            "भाषा I: हिंदी",               30, 2, False),
                    ("English",  "Language II: English",         "भाषा II: अंग्रेज़ी",           30, 3, True),
                    ("Sanskrit", "Language II: Sanskrit",        "भाषा II: संस्कृत",            30, 3, True),
                    ("Urdu",     "Language II: Urdu",            "भाषा II: उर्दू",              30, 3, True),
                    ("Maths",    "Mathematics",                  "गणित",                        30, 4, False),
                    ("EVS",      "Environmental Studies",        "पर्यावरण अध्ययन",             30, 5, False),
                ],
            },
            2: {
                "name_en": "Paper 2 (Class VI-VIII)",
                "name_hi": "पेपर 2 (कक्षा VI-VIII)",
                "total_questions": 150,
                "duration_mins": 150,
                "subjects": [
                    ("CDP",       "Child Development & Pedagogy",    "बाल विकास एवं शिक्षण विधि",   30, 1, False),
                    ("Hindi",     "Language I: Hindi",               "भाषा I: हिंदी",               30, 2, False),
                    ("English",   "Language II: English",            "भाषा II: अंग्रेज़ी",           30, 3, True),
                    ("Sanskrit",  "Language II: Sanskrit",           "भाषा II: संस्कृत",            30, 3, True),
                    ("Urdu",      "Language II: Urdu",               "भाषा II: उर्दू",              30, 3, True),
                    ("Maths_Sci", "Mathematics & Science",           "गणित एवं विज्ञान",            60, 4, True),
                    ("SocSci",    "Social Studies / Social Science", "सामाजिक अध्ययन",             60, 4, True),
                ],
            },
        },
        # Years this exam has been held — add new years as they happen
        "years": [2011, 2013, 2014, 2015, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025, 2026],
    },

    # ── Add CTET when ready ────────────────────────────────────────────────
    "CTET": {
        "name_en": "Central Teacher Eligibility Test",
        "name_hi": "केंद्रीय शिक्षक पात्रता परीक्षा",
        "state": None,   # national exam
        "conducting_body": "CBSE",
        "papers": {
            1: {
                "name_en": "Paper 1 (Class I-V)",
                "name_hi": "पेपर 1 (कक्षा I-V)",
                "total_questions": 150,
                "duration_mins": 150,
                "subjects": [
                    ("CDP",     "Child Development & Pedagogy", "बाल विकास एवं शिक्षण विधि", 30, 1, False),
                    ("Hindi",   "Language I: Hindi",            "भाषा I: हिंदी",              30, 2, False),
                    ("English", "Language II: English",         "भाषा II: अंग्रेज़ी",          30, 3, False),
                    ("Maths",   "Mathematics",                  "गणित",                       30, 4, False),
                    ("EVS",     "Environmental Studies",        "पर्यावरण अध्ययन",            30, 5, False),
                ],
            },
        },
        "years": [2011, 2012, 2013, 2014, 2015, 2016, 2018, 2019, 2021, 2022, 2023, 2024],
    },

    # ── HTET (Haryana) ────────────────────────────────────────────────────
    "HTET": {
        "name_en": "Haryana Teacher Eligibility Test",
        "name_hi": "हरियाणा शिक्षक पात्रता परीक्षा",
        "state": "Haryana",
        "conducting_body": "BSEH",
        "papers": {
            1: {
                "name_en": "Level 1 (PRT)",
                "name_hi": "स्तर 1 (PRT)",
                "total_questions": 150,
                "duration_mins": 150,
                "subjects": [
                    ("CDP",     "Child Development & Pedagogy", "बाल विकास एवं शिक्षण विधि", 30, 1, False),
                    ("Hindi",   "Language I: Hindi",            "भाषा I: हिंदी",              15, 2, False),
                    ("English", "Language II: English",         "भाषा II: अंग्रेज़ी",          15, 3, False),
                    ("GK",      "General Knowledge",            "सामान्य ज्ञान",              30, 4, False),
                    ("Maths",   "Mathematics",                  "गणित",                       30, 5, False),
                    ("EVS",     "Environmental Studies",        "पर्यावरण अध्ययन",            30, 6, False),
                ],
            },
        },
        "years": [2013, 2014, 2018, 2019, 2020, 2022, 2023],
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# OFFICIAL UPTET SYLLABUS TAXONOMY
# This is the COMPLETE syllabus — covers topics even if not yet in any JSON
# Format: { subject_code: { chapter_slug: { name_en, topics: { slug: name } } } }
# ─────────────────────────────────────────────────────────────────────────────
UPTET_SYLLABUS = {
    "CDP": {
        "child_development": {
            "name_en": "Child Development",
            "name_hi": "बाल विकास",
            "topics": {
                "growth_and_development":      "Growth and Development",
                "principles_of_development":   "Principles of Development",
                "stages_of_development":       "Stages of Development",
                "heredity_environment":        "Heredity and Environment",
                "socialisation":               "Socialisation",
                "infancy":                     "Infancy Period",
                "childhood":                   "Childhood Period",
                "adolescence":                 "Adolescence",
            }
        },
        "cognitive_development": {
            "name_en": "Cognitive Development",
            "name_hi": "संज्ञानात्मक विकास",
            "topics": {
                "piaget_theory":               "Piaget's Theory",
                "vygotsky_theory":             "Vygotsky's Theory",
                "kohlberg_moral_development":  "Kohlberg's Moral Development",
                "language_development":        "Language Development",
                "information_processing":      "Information Processing",
                "concept_formation":           "Concept Formation",
            }
        },
        "learning": {
            "name_en": "Learning",
            "name_hi": "अधिगम",
            "topics": {
                "definition_of_learning":      "Definition of Learning",
                "classical_conditioning":      "Classical Conditioning (Pavlov)",
                "operant_conditioning":        "Operant Conditioning (Skinner)",
                "insight_learning":            "Insight Learning (Kohler)",
                "trial_and_error":             "Trial and Error (Thorndike)",
                "transfer_of_learning":        "Transfer of Learning",
                "theories_of_learning":        "Theories of Learning",
                "factors_of_learning":         "Factors of Learning",
                "laws_of_learning":            "Laws of Learning",
            }
        },
        "intelligence": {
            "name_en": "Intelligence",
            "name_hi": "बुद्धि",
            "topics": {
                "theories_of_intelligence":    "Theories of Intelligence",
                "two_factor_theory":           "Two Factor Theory (Spearman)",
                "multiple_intelligences":      "Multiple Intelligences (Gardner)",
                "fluid_crystallized":          "Fluid and Crystallized Intelligence",
                "iq_levels":                   "IQ Levels and Classification",
                "intelligence_tests":          "Intelligence Tests",
                "emotional_intelligence":      "Emotional Intelligence",
            }
        },
        "personality": {
            "name_en": "Personality",
            "name_hi": "व्यक्तित्व",
            "topics": {
                "theories_of_personality":     "Theories of Personality",
                "types_of_personality":        "Types of Personality",
                "personality_tests":           "Personality Tests (MMPI etc.)",
                "gland_based_personality":     "Personality Based on Glands",
            }
        },
        "motivation": {
            "name_en": "Motivation",
            "name_hi": "अभिप्रेरणा",
            "topics": {
                "types_of_motivation":         "Types of Motivation",
                "maslow_hierarchy":            "Maslow's Hierarchy of Needs",
                "instincts_mcdougall":         "Instincts (McDougall)",
                "intrinsic_extrinsic":         "Intrinsic and Extrinsic Motivation",
                "attention_interest":          "Attention and Interest",
            }
        },
        "individual_differences": {
            "name_en": "Individual Differences",
            "name_hi": "वैयक्तिक भिन्नता",
            "topics": {
                "gifted_children":             "Gifted Children",
                "slow_learners":               "Slow Learners",
                "learning_disabilities":       "Learning Disabilities (Dyslexia etc.)",
                "individual_differences":      "Concept of Individual Differences",
            }
        },
        "inclusive_education": {
            "name_en": "Inclusive Education",
            "name_hi": "समावेशी शिक्षा",
            "topics": {
                "rte_act_2009":                "Right to Education Act 2009",
                "ncf_2005":                    "National Curriculum Framework 2005",
                "special_education":           "Special Education",
                "inclusion_concept":           "Concept of Inclusion",
                "disability_types":            "Types of Disabilities",
            }
        },
        "assessment_evaluation": {
            "name_en": "Assessment and Evaluation",
            "name_hi": "मूल्यांकन",
            "topics": {
                "cce":                         "Continuous and Comprehensive Evaluation",
                "formative_assessment":        "Formative Assessment",
                "summative_assessment":        "Summative Assessment",
                "test_construction":           "Test Construction and Blueprint",
                "reliability_validity":        "Reliability and Validity",
            }
        },
        "teaching_methods": {
            "name_en": "Teaching Methods and Models",
            "name_hi": "शिक्षण विधियाँ",
            "topics": {
                "lesson_planning":             "Lesson Planning (Herbart Five Steps)",
                "brainstorming":               "Brainstorming Model",
                "discovery_learning":          "Discovery Learning",
                "constructivism":              "Constructivism",
                "project_method":              "Project Method (Kilpatrick)",
            }
        },
        "creativity": {
            "name_en": "Creativity",
            "name_hi": "सृजनात्मकता",
            "topics": {
                "components_of_creativity":    "Components of Creativity",
                "definitions_of_creativity":   "Definitions of Creativity",
                "fostering_creativity":        "Fostering Creativity in Children",
            }
        },
        "memory": {
            "name_en": "Memory and Thinking",
            "name_hi": "स्मृति एवं चिंतन",
            "topics": {
                "types_of_memory":             "Types of Memory",
                "forgetting":                  "Forgetting and its Causes",
                "thinking_reasoning":          "Thinking and Reasoning",
                "problem_solving":             "Problem Solving",
                "perception":                  "Perception",
            }
        },
    },

    "Hindi": {
        "grammar": {
            "name_en": "Hindi Grammar",
            "name_hi": "हिंदी व्याकरण",
            "topics": {
                "sandhi":                      "Sandhi (Conjunction of Sounds)",
                "samas":                       "Samas (Compound Words)",
                "pratyay":                     "Pratyay (Suffixes)",
                "upsarg":                      "Upsarg (Prefixes)",
                "visheshan":                   "Visheshan (Adjectives)",
                "vachya":                      "Vachya (Voice)",
                "vakya":                       "Vakya (Sentences)",
                "kaal":                        "Kaal (Tenses)",
                "sandhi_viched":               "Sandhi Viched",
                "phonetics":                   "Phonetics and Uccharan",
            }
        },
        "vocabulary": {
            "name_en": "Vocabulary",
            "name_hi": "शब्द भंडार",
            "topics": {
                "tatsam_tadbhav":              "Tatsam and Tadbhav",
                "paryayvachi":                 "Paryayvachi (Synonyms)",
                "vilom":                       "Vilom (Antonyms)",
                "ek_shabd":                    "Ek Shabd (One Word Substitution)",
                "muhavra":                     "Muhavra (Idioms)",
                "word_meanings":               "Word Meanings",
            }
        },
        "comprehension": {
            "name_en": "Reading Comprehension",
            "name_hi": "गद्यांश / पद्यांश",
            "topics": {
                "passage_based":               "Passage Based Questions",
                "poetry_comprehension":        "Poetry Comprehension",
            }
        },
        "literature": {
            "name_en": "Hindi Literature",
            "name_hi": "हिंदी साहित्य",
            "topics": {
                "hindi_poets":                 "Hindi Poets and Works",
                "medieval_poetry":             "Medieval Poetry (Kabir, Tulsidas etc.)",
                "modern_prose":                "Modern Prose Writers",
                "magazines_editors":           "Hindi Magazines and Editors",
                "hindi_compositions":          "Hindi Compositions and Languages",
            }
        },
        "language_skills": {
            "name_en": "Language Skills",
            "name_hi": "भाषा कौशल",
            "topics": {
                "oral_expression":             "Oral Expression",
                "writing_skills":              "Writing Skills",
                "listening_skills":            "Listening Skills",
            }
        },
        "hindi_language": {
            "name_en": "Hindi Language",
            "name_hi": "हिंदी भाषा",
            "topics": {
                "dialects":                    "Dialects of Hindi",
                "hindi_worldwide":             "Hindi Worldwide",
                "orthography":                 "Orthography and Spelling",
            }
        },
        "idioms_proverbs": {
            "name_en": "Idioms and Proverbs",
            "name_hi": "मुहावरे और लोकोक्तियाँ",
            "topics": {
                "muhavre":                     "Muhavare (Idioms)",
                "proverbs":                    "Lokoktiyan (Proverbs)",
            }
        },
    },

    "English": {
        "grammar": {
            "name_en": "English Grammar",
            "name_hi": "अंग्रेज़ी व्याकरण",
            "topics": {
                "tenses":                      "Tenses",
                "adjectives":                  "Adjectives and Types",
                "conjunctions":                "Conjunctions",
                "prepositions":                "Prepositions",
                "pronouns":                    "Pronouns",
                "narration":                   "Direct and Indirect Speech",
                "voice":                       "Active and Passive Voice",
                "sentence_types":              "Types of Sentences",
                "parts_of_speech":             "Parts of Speech",
                "sentence_transformation":     "Sentence Transformation",
                "participles":                 "Participles and Gerunds",
                "sentence_rearrangement":      "Sentence Rearrangement",
            }
        },
        "vocabulary": {
            "name_en": "Vocabulary",
            "name_hi": "शब्द भंडार",
            "topics": {
                "synonyms":                    "Synonyms",
                "antonyms":                    "Antonyms",
                "word_meanings":               "Word Meanings",
                "spelling":                    "Spelling",
                "subject_names":               "Subject and Field Names",
            }
        },
        "idioms": {
            "name_en": "Idioms and Phrases",
            "name_hi": "मुहावरे",
            "topics": {
                "idiom_meanings":              "Idiom Meanings",
                "proverbs":                    "Proverbs",
            }
        },
        "comprehension": {
            "name_en": "Reading Comprehension",
            "name_hi": "पठन बोध",
            "topics": {
                "passage_based":               "Passage Based Questions",
                "inference":                   "Inference Questions",
                "direct_question":             "Direct Questions from Passage",
            }
        },
        "figures_of_speech": {
            "name_en": "Figures of Speech",
            "name_hi": "अलंकार",
            "topics": {
                "metaphor":                    "Metaphor",
                "simile":                      "Simile",
                "personification":             "Personification",
                "identification":              "Identification of Figure of Speech",
            }
        },
    },

    "Maths": {
        "number_system": {
            "name_en": "Number System",
            "name_hi": "संख्या पद्धति",
            "topics": {
                "types_of_numbers":            "Types of Numbers",
                "prime_numbers":               "Prime Numbers",
                "hcf_lcm":                     "HCF and LCM",
                "divisibility":                "Divisibility Rules",
                "unit_digit":                  "Unit Digit Problems",
                "fractions":                   "Fractions and Decimals",
            }
        },
        "arithmetic": {
            "name_en": "Arithmetic",
            "name_hi": "अंकगणित",
            "topics": {
                "percentage":                  "Percentage",
                "profit_loss":                 "Profit and Loss",
                "ratio_proportion":            "Ratio and Proportion",
                "simple_interest":             "Simple Interest",
                "compound_interest":           "Compound Interest",
                "time_work":                   "Time and Work",
                "time_distance":               "Time and Distance",
                "average":                     "Average",
                "division":                    "Division, Quotient and Remainder",
            }
        },
        "algebra": {
            "name_en": "Algebra",
            "name_hi": "बीजगणित",
            "topics": {
                "algebraic_expressions":       "Algebraic Expressions",
                "equations":                   "Linear Equations",
                "simultaneous_equations":      "Simultaneous Equations",
                "exponents":                   "Exponents and Powers",
                "surds_indices":               "Surds and Indices",
            }
        },
        "geometry": {
            "name_en": "Geometry",
            "name_hi": "ज्यामिति",
            "topics": {
                "triangles":                   "Triangles and Properties",
                "quadrilaterals":              "Quadrilaterals",
                "circles":                     "Circles",
                "polygons":                    "Polygons and Angles",
                "construction":                "Geometrical Constructions",
            }
        },
        "mensuration": {
            "name_en": "Mensuration",
            "name_hi": "क्षेत्रमिति",
            "topics": {
                "area":                        "Area of Plane Figures",
                "perimeter":                   "Perimeter",
                "volume":                      "Volume and Surface Area",
                "cube":                        "Cube and Cuboid Problems",
            }
        },
        "statistics": {
            "name_en": "Statistics and Data Handling",
            "name_hi": "सांख्यिकी",
            "topics": {
                "central_tendency":            "Measures of Central Tendency",
                "mean_median_mode":            "Mean, Median and Mode",
                "data_interpretation":         "Data Interpretation",
                "analysis_of_variance":        "Analysis of Variance",
                "means":                       "AM, GM and HM",
            }
        },
        "time_calendar": {
            "name_en": "Time and Calendar",
            "name_hi": "समय एवं कैलेंडर",
            "topics": {
                "calendar_problems":           "Calendar Problems",
                "time_calculations":           "Time Calculations",
            }
        },
        "mathematicians": {
            "name_en": "Famous Mathematicians",
            "name_hi": "प्रसिद्ध गणितज्ञ",
            "topics": {
                "indian_mathematicians":       "Indian Mathematicians",
                "world_mathematicians":        "World Mathematicians",
            }
        },
    },

    "EVS": {
        "ecosystem": {
            "name_en": "Ecosystem",
            "name_hi": "पारिस्थितिकी तंत्र",
            "topics": {
                "components_of_ecosystem":     "Components of Ecosystem",
                "biotic_abiotic":              "Biotic and Abiotic Components",
                "food_chain":                  "Food Chain and Food Web",
                "ecology":                     "Ecology and its Scope",
                "biodiversity":                "Biodiversity",
            }
        },
        "pollution": {
            "name_en": "Environment and Pollution",
            "name_hi": "पर्यावरण एवं प्रदूषण",
            "topics": {
                "water_pollution":             "Water Pollution",
                "air_pollution":               "Air Pollution",
                "soil_pollution":              "Soil Pollution",
                "acid_rain":                   "Acid Rain",
                "biomagnification":            "Biomagnification",
                "greenhouse_effect":           "Greenhouse Effect",
                "ozone_depletion":             "Ozone Layer Depletion",
                "pollution_control":           "Pollution Control Agencies",
            }
        },
        "conservation": {
            "name_en": "Conservation",
            "name_hi": "संरक्षण",
            "topics": {
                "wildlife_protection_act":     "Wildlife Protection Act",
                "biodiversity_act":            "Biodiversity Act",
                "acts_laws":                   "Environmental Acts and Laws",
                "national_parks":              "National Parks and Sanctuaries",
                "sanctuaries":                 "Wildlife Sanctuaries",
                "wildlife_projects":           "Wildlife Projects (Tiger, Elephant)",
                "organizations":               "Environmental Organizations",
            }
        },
        "geography": {
            "name_en": "Geography",
            "name_hi": "भूगोल",
            "topics": {
                "atmosphere":                  "Atmosphere and its Layers",
                "climate":                     "Climate and Weather",
                "solar_radiation":             "Solar Radiation and Insolation",
                "latitudes":                   "Latitudes and Longitudes",
                "rivers":                      "Rivers of India",
                "volcanoes":                   "Volcanoes",
                "mountains":                   "Mountains and Passes",
                "rain_shadow":                 "Rain Shadow Effect",
            }
        },
        "history": {
            "name_en": "History",
            "name_hi": "इतिहास",
            "topics": {
                "freedom_movement":            "Indian Freedom Movement",
                "ancient_history":             "Ancient India",
                "medieval_history":            "Medieval India",
                "modern_history":              "Modern India",
            }
        },
        "civics": {
            "name_en": "Civics and Constitution",
            "name_hi": "नागरिक शास्त्र एवं संविधान",
            "topics": {
                "constitution":                "Indian Constitution",
                "fundamental_rights":          "Fundamental Rights and Duties",
                "national_symbols":            "National Symbols",
                "government":                  "Government Structure",
            }
        },
        "science": {
            "name_en": "General Science",
            "name_hi": "सामान्य विज्ञान",
            "topics": {
                "solar_system":                "Solar System and Universe",
                "carbon_dating":               "Carbon Dating",
                "fuels":                       "Fuels and Energy",
                "health_nutrition":            "Health and Nutrition",
                "diseases":                    "Diseases and Prevention",
            }
        },
        "agriculture": {
            "name_en": "Agriculture",
            "name_hi": "कृषि",
            "topics": {
                "farming_practices":           "Farming Practices",
                "crops":                       "Crops and Seasons",
                "irrigation":                  "Irrigation Methods",
            }
        },
        "evs_pedagogy": {
            "name_en": "EVS Pedagogy",
            "name_hi": "पर्यावरण शिक्षण विधि",
            "topics": {
                "evs_teaching_methods":        "EVS Teaching Methods",
                "evs_objectives":              "Objectives of EVS",
            }
        },
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# UTILITY
# ─────────────────────────────────────────────────────────────────────────────
def slugify(s: str) -> str:
    if not s:
        return ""
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def get_or_create(cur, table: str, where_cols: dict, insert_cols: dict) -> str:
    """
    Generic get-or-create that returns the UUID.
    Uses parameterized queries — apostrophe safe.
    """
    where_clause = " AND ".join(f"{k} = %s" for k in where_cols)
    cur.execute(
        f"SELECT id FROM {table} WHERE {where_clause}",
        list(where_cols.values())
    )
    row = cur.fetchone()
    if row:
        return str(row[0])

    all_cols = {**where_cols, **insert_cols}
    cols = ", ".join(all_cols.keys())
    vals = ", ".join(["%s"] * len(all_cols))
    cur.execute(
        f"INSERT INTO {table} ({cols}) VALUES ({vals}) RETURNING id",
        list(all_cols.values())
    )
    return str(cur.fetchone()[0])


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: SEED EXAM TAXONOMY
# ─────────────────────────────────────────────────────────────────────────────
def seed_exam(cur, exam_code: str) -> str:
    """Seed exam row, return exam_id."""
    cfg = EXAM_CONFIGS[exam_code]
    return get_or_create(
        cur, "exams",
        where_cols={"code": exam_code},
        insert_cols={
            "name_en":         cfg["name_en"],
            "name_hi":         cfg.get("name_hi"),
            "state":           cfg.get("state"),
            "conducting_body": cfg.get("conducting_body"),
        }
    )


def seed_paper(cur, exam_id: str, paper_number: int, exam_code: str) -> str:
    """Seed exam_paper row, return paper_id."""
    cfg = EXAM_CONFIGS[exam_code]["papers"][paper_number]
    return get_or_create(
        cur, "exam_papers",
        where_cols={"exam_id": exam_id, "paper_number": paper_number},
        insert_cols={
            "name_en":         cfg["name_en"],
            "name_hi":         cfg.get("name_hi"),
            "total_questions": cfg.get("total_questions", 150),
            "duration_mins":   cfg.get("duration_mins", 150),
        }
    )


def seed_sessions(cur, paper_id: str, exam_code: str, paper_number: int):
    """Seed all exam_session rows for every year in config."""
    years = EXAM_CONFIGS[exam_code]["years"]
    for year in years:
        get_or_create(
            cur, "exam_sessions",
            where_cols={"exam_paper_id": paper_id, "year": year, "session": "Main"},
            insert_cols={"is_verified": False}
        )
    print(f"    Sessions seeded: {len(years)} years")


def seed_subjects(cur, paper_id: str, exam_code: str, paper_number: int) -> dict:
    """Seed subjects, return {subject_code: subject_id}."""
    subjects = EXAM_CONFIGS[exam_code]["papers"][paper_number]["subjects"]
    subj_map = {}
    for (code, name_en, name_hi, q_count, sort, is_optional) in subjects:
        sid = get_or_create(
            cur, "subjects",
            where_cols={"exam_paper_id": paper_id, "code": code},
            insert_cols={
                "name_en":       name_en,
                "name_hi":       name_hi,
                "question_count": q_count,
                "sort_order":    sort,
                "is_optional":   is_optional,
            }
        )
        subj_map[code] = sid
    print(f"    Subjects seeded: {len(subj_map)}")
    return subj_map


def seed_official_syllabus(cur, subj_map: dict):
    """
    Seed complete official UPTET syllabus taxonomy.
    This covers ALL topics, even ones not yet in any JSON file.
    """
    total_chapters = 0
    total_topics = 0

    for subj_code, chapters in UPTET_SYLLABUS.items():
        if subj_code not in subj_map:
            continue
        subj_id = subj_map[subj_code]

        for chap_slug, chap_data in chapters.items():
            chap_id = get_or_create(
                cur, "chapters",
                where_cols={"subject_id": subj_id, "slug": chap_slug},
                insert_cols={
                    "name_en":    chap_data["name_en"],
                    "name_hi":    chap_data.get("name_hi"),
                    "sort_order": 0,
                }
            )
            total_chapters += 1

            for topic_slug, topic_name in chap_data["topics"].items():
                get_or_create(
                    cur, "topics",
                    where_cols={"chapter_id": chap_id, "slug": topic_slug},
                    insert_cols={"name_en": topic_name}
                )
                total_topics += 1

    print(f"    Official syllabus seeded: {total_chapters} chapters, {total_topics} topics")


def seed_json_taxonomy(cur, questions: list, subj_map: dict) -> dict:
    """
    Auto-discover any chapters/topics/subtopics found in JSON
    that are NOT in the official syllabus yet. Adds them too.
    Returns cache: {(subj_code, chap_slug, topic_slug, sub_slug): ids}
    """
    new_chapters = 0
    new_topics = 0
    new_subtopics = 0
    cache = {}

    for q in questions:
        subj_code = q.get("subject", "")
        if subj_code not in subj_map:
            continue
        subj_id = subj_map[subj_code]

        chap_name  = q.get("chapter", "")
        topic_name = q.get("topic", "")
        sub_name   = q.get("subtopic", "")

        chap_slug  = slugify(chap_name)
        topic_slug = slugify(topic_name)
        sub_slug   = slugify(sub_name)

        if not chap_slug:
            continue

        # Chapter
        key_chap = (subj_code, chap_slug)
        if key_chap not in cache:
            cid = get_or_create(
                cur, "chapters",
                where_cols={"subject_id": subj_id, "slug": chap_slug},
                insert_cols={"name_en": chap_name or chap_slug, "sort_order": 0}
            )
            cache[key_chap] = cid
            new_chapters += 1
        chap_id = cache[key_chap]

        if not topic_slug:
            continue

        # Topic
        key_topic = (subj_code, chap_slug, topic_slug)
        if key_topic not in cache:
            tid = get_or_create(
                cur, "topics",
                where_cols={"chapter_id": chap_id, "slug": topic_slug},
                insert_cols={"name_en": topic_name or topic_slug}
            )
            cache[key_topic] = tid
            new_topics += 1
        topic_id = cache[key_topic]

        if not sub_slug:
            continue

        # Subtopic
        key_sub = (subj_code, chap_slug, topic_slug, sub_slug)
        if key_sub not in cache:
            sid = get_or_create(
                cur, "subtopics",
                where_cols={"topic_id": topic_id, "slug": sub_slug},
                insert_cols={"name_en": sub_name or sub_slug}
            )
            cache[key_sub] = sid
            new_subtopics += 1
        cache[key_sub] = cache.get(key_sub)

    if new_chapters or new_topics or new_subtopics:
        print(f"    JSON extras added: {new_chapters} chapters, {new_topics} topics, {new_subtopics} subtopics")
    return cache


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: INSERT QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────
def insert_question(cur, q: dict, subj_map: dict, taxonomy_cache: dict,
                    exam_code: str, paper_id: str) -> str | None:
    """
    Insert one question. Returns UUID or None on failure.
    APOSTROPHE SAFE: all values passed as psycopg2 parameters.
    """
    subj_code = q.get("subject", "")
    if subj_code not in subj_map:
        raise ValueError(f"Subject '{subj_code}' not in subjects table. Check EXAM_CONFIGS.")

    subj_id = subj_map[subj_code]

    chap_slug  = slugify(q.get("chapter", ""))
    topic_slug = slugify(q.get("topic", ""))
    sub_slug   = slugify(q.get("subtopic", ""))

    chap_id  = taxonomy_cache.get((subj_code, chap_slug))
    topic_id = taxonomy_cache.get((subj_code, chap_slug, topic_slug))
    sub_id   = taxonomy_cache.get((subj_code, chap_slug, topic_slug, sub_slug))

    # Get exam_session_id
    year = q.get("source_year")
    paper_number = q.get("paper", 1)
    cur.execute(
        "SELECT id FROM exam_sessions WHERE exam_paper_id = %s AND year = %s AND session = 'Main'",
        (paper_id, year)
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"No exam_session for year={year}. Check EXAM_CONFIGS years list.")
    session_id = row[0]

    # Validate options — must have A,B,C,D
    options = q.get("options", {})
    if not isinstance(options, dict) or not all(k in options for k in ("A","B","C","D")):
        raise ValueError(f"Options must be dict with keys A,B,C,D. Got: {options}")

    correct = (q.get("correct") or "A").upper()
    if correct not in ("A","B","C","D","E"):
        raise ValueError(f"correct must be A-E, got: {correct}")

    difficulty = q.get("difficulty", "medium")
    if difficulty not in ("easy","medium","hard"):
        difficulty = "medium"

    bloom = q.get("bloom_level", "remember")
    if bloom not in ("remember","understand","apply","analyse","evaluate","create"):
        bloom = "remember"

    qtype = q.get("question_type", "factual")
    if qtype not in ("factual","conceptual","application","vocabulary","analytical"):
        qtype = "factual"

    sql = """
        INSERT INTO questions (
            legacy_id, exam_session_id, subject_id, chapter_id, topic_id, subtopic_id,
            exam_code, paper_number, source_year, subject_code, chapter_slug, topic_slug, subtopic_slug,
            question_hi, question_en, options, correct_option,
            difficulty, bloom_level, question_type, is_pyq, is_verified
        ) VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s
        )
        ON CONFLICT (legacy_id) DO UPDATE SET
            question_hi    = EXCLUDED.question_hi,
            question_en    = EXCLUDED.question_en,
            options        = EXCLUDED.options,
            correct_option = EXCLUDED.correct_option,
            difficulty     = EXCLUDED.difficulty,
            bloom_level    = EXCLUDED.bloom_level,
            chapter_id     = EXCLUDED.chapter_id,
            topic_id       = EXCLUDED.topic_id,
            subtopic_id    = EXCLUDED.subtopic_id,
            updated_at     = NOW()
        RETURNING id
    """

    cur.execute(sql, (
        q.get("id"),        session_id,   subj_id,    chap_id,    topic_id,   sub_id,
        exam_code,          paper_number, year,        subj_code,  chap_slug,  topic_slug, sub_slug,
        q.get("question_hi"), q.get("question_en"),
        json.dumps(options, ensure_ascii=False),
        correct,
        difficulty, bloom, qtype,
        bool(q.get("is_pyq", True)),
        bool(q.get("verified", False))
    ))
    return str(cur.fetchone()[0])


def insert_tags(cur, question_uuid: str, tags: list):
    for tag in (tags or []):
        tag_slug = slugify(str(tag))
        if not tag_slug:
            continue
        cur.execute(
            "INSERT INTO tags (slug, display) VALUES (%s, %s) ON CONFLICT (slug) DO NOTHING",
            (tag_slug, str(tag))
        )
        cur.execute(
            """INSERT INTO question_tags (question_id, tag_id)
               SELECT %s, id FROM tags WHERE slug = %s
               ON CONFLICT DO NOTHING""",
            (question_uuid, tag_slug)
        )


# ─────────────────────────────────────────────────────────────────────────────
# MAIN IMPORT FLOW
# ─────────────────────────────────────────────────────────────────────────────
def import_file(conn, filepath: str, exam_code: str):
    print(f"\n{'='*60}")
    print(f"  File:  {filepath}")
    print(f"  Exam:  {exam_code}")
    print(f"{'='*60}")

    with open(filepath, encoding="utf-8") as f:
        questions = json.load(f)

    if not questions:
        print("  Empty file — skipping")
        return 0, 0

    # Detect paper number from first question
    paper_number = questions[0].get("paper", 1)
    year = questions[0].get("source_year", "?")
    print(f"  Questions: {len(questions)} | Paper: {paper_number} | Year: {year}")

    success = failed = 0
    errors = []

    with conn.cursor() as cur:
        # ── Seed taxonomy ───────────────────────────────────────────
        print("\n  [1/4] Seeding exam...")
        exam_id = seed_exam(cur, exam_code)

        print("  [2/4] Seeding papers, sessions, subjects...")
        paper_id = seed_paper(cur, exam_id, paper_number, exam_code)
        seed_sessions(cur, paper_id, exam_code, paper_number)
        subj_map = seed_subjects(cur, paper_id, exam_code, paper_number)

        print("  [3/4] Seeding official syllabus taxonomy...")
        seed_official_syllabus(cur, subj_map)

        print("  [4/4] Seeding JSON-discovered taxonomy extras...")
        tax_cache = seed_json_taxonomy(cur, questions, subj_map)
        conn.commit()

        # ── Insert questions ─────────────────────────────────────────
        print(f"\n  Inserting {len(questions)} questions...")
        for i, q in enumerate(questions):
            try:
                qid = insert_question(cur, q, subj_map, tax_cache, exam_code, paper_id)
                insert_tags(cur, qid, q.get("tags", []))
                conn.commit()
                success += 1
                if (i + 1) % 30 == 0:
                    print(f"    {i+1}/{len(questions)} done ({success} ok, {failed} failed)")
            except Exception as e:
                conn.rollback()
                failed += 1
                errors.append({"id": q.get("id", f"idx_{i}"), "error": str(e)})

    print(f"\n  Result: {success} inserted/updated, {failed} failed")

    if errors:
        err_path = filepath.replace(".json", "_errors.json")
        with open(err_path, "w") as f:
            json.dump(errors, f, indent=2)
        print(f"  Errors saved to: {err_path}")
        for e in errors[:5]:
            print(f"    {e['id']}: {e['error'][:100]}")

    return success, failed


def verify(conn, exam_code: str):
    print(f"\n{'─'*60}")
    print(f"  VERIFICATION — {exam_code}")
    print(f"{'─'*60}")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT source_year, subject_code,
                   COUNT(*)                                              AS total,
                   SUM(CASE WHEN chapter_id IS NOT NULL THEN 1 ELSE 0 END) AS mapped_ch,
                   SUM(CASE WHEN topic_id   IS NOT NULL THEN 1 ELSE 0 END) AS mapped_tp,
                   SUM(CASE WHEN is_verified THEN 1 ELSE 0 END)            AS verified
            FROM questions
            WHERE exam_code = %s
            GROUP BY source_year, subject_code
            ORDER BY source_year, subject_code
        """, (exam_code,))
        rows = cur.fetchall()
        if not rows:
            print("  No questions found.")
            return
        print(f"  {'Year':>6} {'Subject':<12} {'Total':>6} {'Mapped Ch':>10} {'Mapped Tp':>10} {'Verified':>9}")
        print(f"  {'─'*56}")
        total = 0
        for r in rows:
            ch_ok = "✓" if r["mapped_ch"] == r["total"] else f"{r['mapped_ch']}/{r['total']}"
            tp_ok = "✓" if r["mapped_tp"] == r["total"] else f"{r['mapped_tp']}/{r['total']}"
            print(f"  {r['source_year']:>6} {r['subject_code']:<12} {r['total']:>6} {ch_ok:>10} {tp_ok:>10} {r['verified']:>9}")
            total += r["total"]
        print(f"  {'─'*56}")
        print(f"  TOTAL: {total} questions")


def main():
    parser = argparse.ArgumentParser(description="UPTET Question Bank Importer")
    parser.add_argument("files", nargs="+", help="JSON files to import")
    parser.add_argument("--exam", default="UPTET", help="Exam code (UPTET/CTET/HTET)")
    args = parser.parse_args()

    if args.exam not in EXAM_CONFIGS:
        print(f"Unknown exam: {args.exam}. Available: {list(EXAM_CONFIGS.keys())}")
        sys.exit(1)

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Set DATABASE_URL environment variable")
        print("  export DATABASE_URL=postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres")
        sys.exit(1)

    try:
        conn = psycopg2.connect(db_url)
        print(f"Connected to database")
    except Exception as e:
        print(f"Connection failed: {e}")
        sys.exit(1)

    total_ok = total_fail = 0
    for filepath in args.files:
        try:
            ok, fail = import_file(conn, filepath, args.exam)
            total_ok += ok
            total_fail += fail
        except FileNotFoundError:
            print(f"File not found: {filepath}")

    # Refresh materialized view
    try:
        with conn.cursor() as cur:
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY topic_frequency")
            conn.commit()
        print("\n  topic_frequency view refreshed")
    except Exception as e:
        print(f"\n  Could not refresh topic_frequency: {e}")

    verify(conn, args.exam)
    conn.close()

    print(f"\n{'='*60}")
    print(f"  DONE: {total_ok} inserted/updated, {total_fail} failed")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
