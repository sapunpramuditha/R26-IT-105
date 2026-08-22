## Prerequisites
- Python 3.10

## Setup Instructions

1. **Create a virtual environment:**
   We recommend creating a virtual environment to manage project dependencies.
   ```powershell
   py -3.11 -m venv .venv
   ```

2. **Activate the virtual environment (optional but recommended):**
   ```powershell
   # On Windows
   .venv\Scripts\activate
   ```
   *Note: If you receive a security error about running scripts being disabled, you may need to update your PowerShell execution policy for the current user by running this command as an administrator or just for your user:*
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

3. **Install the dependencies:**
   You can install the dependencies directly using the python executable within the virtual environment:
   ```powershell
   .venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

## Running the Application

You can run the application using the following command:
```powershell
.venv\Scripts\python.exe main.py
```


winget install Gyan.FFmpeg

## Candidate competency score

The profile analysis keeps the existing 0–10 competency score and combines four
explainable signals:

| Signal | Weight |
| --- | ---: |
| Resume evidence (skills, experience, education, certifications, projects) | 35% |
| GitHub activity and repository quality | 20% |
| Skill graph / GNN evidence | 25% |
| CV–GitHub cross-platform consistency | 20% |

Cross-platform consistency is the percentage of normalized CV skills for which
direct evidence is found in GitHub languages, repository metadata/topics, or
README content. GNN-inferred skills are not treated as direct GitHub evidence.
When GitHub or consistency evidence is unavailable, its weight is redistributed
to the resume signal so missing public data does not automatically penalize a
candidate. Existing score bonuses and penalties are applied afterward, and the
result is clamped to the 0–10 range.
