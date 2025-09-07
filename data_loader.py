import pandas as pd

def load_google_sheet_data(sheet_url):
    """
    Load data from a public Google Sheet
    
    Args:
        sheet_url: URL of the Google Sheet
    
    Returns:
        pandas.DataFrame: The loaded data
    """
    try:
        # Extract sheet ID from URL
        if 'docs.google.com' in sheet_url:
            sheet_id = sheet_url.split('/d/')[1].split('/')[0]
        else:
            sheet_id = sheet_url
        
        # Create CSV export URL for public sheets
        csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
        
        # Load the data
        df = pd.read_csv(csv_url)
        
        return df
        
    except Exception as e:
        print(f"Error loading data: {e}")
        print("Make sure your Google Sheet is public (Anyone with link can view)")
        return None