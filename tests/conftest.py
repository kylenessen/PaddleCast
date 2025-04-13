import sys
import os

# Add the project root directory (which contains the 'src' folder) to the Python path
# This allows pytest to find the 'src' module when running tests from the root directory
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, project_root)

# You can also define shared fixtures here if needed in the future
