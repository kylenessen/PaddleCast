import pandas as pd

def load_google_sheet_data(sheet_url, gid=None):
    """
    Load data from a public Google Sheet (single tab)
    
    Args:
        sheet_url: URL of the Google Sheet
        gid: Specific worksheet ID (optional, defaults to first sheet)
    
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
        if gid:
            csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
        else:
            csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
        
        # Load the data
        df = pd.read_csv(csv_url)
        
        return df
        
    except Exception as e:
        print(f"Error loading data: {e}")
        print("Make sure your Google Sheet is public (Anyone with link can view)")
        return None

def load_all_sheets(sheet_url, sheet_gids=None):
    """
    Load data from multiple tabs in a Google Sheet
    
    Args:
        sheet_url: URL of the Google Sheet
        sheet_gids: Dictionary mapping sheet names to GIDs, or list of GIDs
                   If None, you'll need to provide GIDs manually
    
    Returns:
        dict: Dictionary with sheet names as keys and DataFrames as values
    """
    sheets = {}
    
    if sheet_gids is None:
        print("To load multiple sheets, you need to provide the GIDs.")
        print("You can find GIDs in your Google Sheet URLs (the #gid=NUMBER part)")
        return sheets
    
    if isinstance(sheet_gids, dict):
        # Dictionary format: {'Sheet1': 0, 'Sheet2': 123456}
        for name, gid in sheet_gids.items():
            print(f"Loading sheet: {name}")
            df = load_google_sheet_data(sheet_url, gid)
            if df is not None:
                sheets[name] = df
            else:
                print(f"Failed to load sheet: {name}")
    
    elif isinstance(sheet_gids, list):
        # List format: [0, 123456, 789012]
        for i, gid in enumerate(sheet_gids):
            name = f"Sheet_{i}"
            print(f"Loading sheet: {name} (GID: {gid})")
            df = load_google_sheet_data(sheet_url, gid)
            if df is not None:
                sheets[name] = df
            else:
                print(f"Failed to load sheet with GID: {gid}")
    
    return sheets

def get_sheet_gids_from_url(sheet_url):
    """
    Helper function to extract GID from a Google Sheets URL
    
    Args:
        sheet_url: URL of the Google Sheet
    
    Returns:
        int: The GID (worksheet ID)
    """
    if '#gid=' in sheet_url:
        return int(sheet_url.split('#gid=')[1])
    else:
        return 0  # Default first sheet