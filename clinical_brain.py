import os
import pandas as pd
import kagglehub
import json
import sys
from groq import Groq

# ── CONFIG ──────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY)

def download_data():
    print("Fetching healthcare dataset from Kaggle...")
    path = kagglehub.dataset_download("prasad22/healthcare-dataset")
    csv_path = os.path.join(path, "healthcare_dataset.csv")
    return pd.read_csv(csv_path)

def query_brain(question, df):
    columns = list(df.columns)
    
    prompt = f"""
    You are a clinical data scientist. Convert the following question into a single line of Python Pandas code.
    The dataframe is named 'df'. 
    Columns: {columns}
    
    Question: {question}
    
    Return ONLY the code. No explanation. 
    Example: df[df['Medical Condition'] == 'Dengue'].shape[0]
    """
    
    try:
        completion = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        code = completion.choices[0].message.content.strip().replace('```python', '').replace('```', '')
        
        # Safety check & Execution
        result = eval(code)
        return str(result)
    except Exception as e:
        return f"I encountered an error analyzing the records: {str(e)}"

if __name__ == "__main__":
    df = download_data()
    if len(sys.argv) > 1:
        question = " ".join(sys.argv[1:])
        answer = query_brain(question, df)
        print(f"RESULT: {answer}")
    else:
        print("Brain Active. Ready for queries.")
