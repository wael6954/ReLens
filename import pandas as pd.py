import pandas as pd
import matplotlib.pyplot as plt
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import numpy as np

#Read 2025 CSV
streetcars2025 = pd.read_csv(
    "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/b68cb71b-44a7-4394-97e2-5d2f41462a5d/resource/cf2fdd12-6f0e-4644-aae7-0bbfc31df031/download/TTC%20Streetcar%20Delay%20Data%20since%202025.csv"
)
streetcars2025= streetcars2025.drop(columns=["_id", "Code"], errors="ignore")
streetcars2025["Date"] = pd.to_datetime(streetcars2025["Date"], errors="coerce")
streetcars2025["Time"] = pd.to_datetime(streetcars2025["Time"], format="%H:%M", errors="coerce")
streetcars2025["Min Delay"] = streetcars2025["Min Delay"].astype(float)
streetcars2025['Min Gap']= streetcars2025['Min Gap'].astype(float)
streetcars2025["Vehicle"] = streetcars2025["Vehicle"].astype(float) 


# Local Excel files
files = {
    "2024": r"C:\Users\Owner\Downloads\Streetcar Delay Data\ttc-streetcar-delay-data-2024.xlsx",
    "2021": r"C:\Users\Owner\Downloads\Streetcar Delay Data\ttc-streetcar-delay-data-2021.xlsx",
    "2020": r"C:\Users\Owner\Downloads\Streetcar Delay Data\ttc-streetcar-delay-data-2020.xlsx",
    "2018": r"C:\Users\Owner\Downloads\Streetcar Delay Data\ttc-streetcar-delay-data-2018.xlsx",
    "2016": r"C:\Users\Owner\Downloads\Streetcar Delay Data\ttc-streetcar-delay-data-2016.xlsx",
    "2015": r"C:\Users\Owner\Downloads\Streetcar Delay Data\ttc-streetcar-delay-data-2015.xlsx",
    "2014": r"C:\Users\Owner\Downloads\Streetcar Delay Data\ttc-streetcar-delay-data-2014.xlsx",
}

# Dictionary to hold cleaned yearly dataframes
yearly_dfs = {}

for year, path in files.items():
    # Read all sheets for this year
    sheets = pd.read_excel(path, sheet_name=None)
    df = pd.concat(sheets.values(), ignore_index=True)
    df["Year"] = year
    
    # --- Column harmonization ---
    if "Route" in df.columns and "Line" in df.columns:
        df["Line"] = df["Line"].combine_first(df["Route"])
        df["Route"] = df["Route"].combine_first(df["Line"])
    elif "Route" in df.columns:
        df["Line"] = df["Route"]
    elif "Line" in df.columns:
        df["Route"] = df["Line"]
    
    if "Line" in df.columns:
        df["Line"] = (
            df["Line"]
            .astype(str)
            .str.upper()
            .str.strip()
            .str.replace(r"\s+", " ", regex=True)   # collapse multiple spaces
            .str.replace("\u202f", " ", regex=False)  # replace NBSP
            .str.replace("-", " ", regex=False)     # unify dashes
        )


    if "Bound" in df.columns and "Direction" in df.columns:
        df["Direction"] = df["Direction"].astype(str).str.replace("/B", "", regex=False)
        df["Bound"] = df["Bound"].combine_first(df["Direction"])
    elif "Direction" in df.columns:
        df["Bound"] = df["Direction"].astype(str).str.replace("/B", "", regex=False)

    if "Delay" in df.columns and "Min Delay" in df.columns:
        df["Min Delay"] = df["Min Delay"].combine_first(df["Delay"])
        df["Delay"] = df["Delay"].combine_first(df["Min Delay"])
    elif "Delay" in df.columns:
        df["Min Delay"] = df["Delay"]
    elif "Min Delay" in df.columns:
        df["Delay"] = df["Min Delay"]

    if "Gap" in df.columns and "Min Gap" in df.columns:
        df["Min Gap"] = df["Min Gap"].combine_first(df["Gap"])
        df["Gap"] = df["Gap"].combine_first(df["Min Gap"])
    elif "Gap" in df.columns:
        df["Min Gap"] = df["Gap"]
    elif "Min Gap" in df.columns:
        df["Gap"] = df["Min Gap"]

    if "Report Date" in df.columns and "Date" in df.columns:
        df["Date"] = df["Date"].combine_first(df["Report Date"])
        df["Report Date"] = df["Report Date"].combine_first(df["Date"])
    elif "Report Date" in df.columns:
        df["Date"] = df["Report Date"]
    elif "Date" in df.columns:
        df["Report Date"] = df["Date"]

    # Ensure datetime
    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    if "Time" in df.columns:
        if year in ["2020", "2021", "2024"]:
            df["Time"] = pd.to_datetime(df["Time"], format="%H:%M", errors="coerce")
        else:
            df["Time"] = pd.to_datetime(df["Time"], format="%H:%M:%S", errors="coerce")
    

    if "Location" in df.columns and "Station" in df.columns:
        df["Station"] = df["Station"].combine_first(df["Location"])
        df["Location"] = df["Location"].combine_first(df["Station"])
    elif "Location" in df.columns:
        df["Station"] = df["Location"]
    elif "Station" in df.columns:
        df["Location"] = df["Station"]

    # Drop extra columns if they exist
    df = df.drop(columns=[
        "Route","Direction","Delay","Gap",
        "Report Date","Location","_id","Code","Incident","Day"
    ], errors="ignore")

    # Store cleaned dataframe for this year
    yearly_dfs[year] = df

# Concatenate all yearly dfs (dict values) + 2025
streetcars = pd.concat(
    [*yearly_dfs.values(), streetcars2025], 
    ignore_index=True
)

streetcars= streetcars.drop(columns=["Year", 'Day'], errors="ignore")

list = ["301", "303", "304", "305", "306", "310", "501", "503", "504", "505", "506", "507", "509", "510", "511", "512"]

for i in list:
    fivetendelay_df = streetcars[streetcars["Line"].str.contains(i, na= False)].copy()

    #filter to only vehicles between 4000 and 5000 : streetcars on the streets
    vehicle_id_grp = fivetendelay_df.sort_values(by="Vehicle")
    vehicle_id_grp = vehicle_id_grp.dropna()
    vehicle_id_grp = vehicle_id_grp[vehicle_id_grp["Vehicle"]<5000]
    vehicle_id_grp = vehicle_id_grp[vehicle_id_grp["Vehicle"]>4000]
    

    #group by vehicle id and get the mean delay for each vehicle - see if its a mechanical issue
    vehicle_id_grp_per_vehicle = vehicle_id_grp.groupby("Vehicle").mean(numeric_only=True)     
 

    #filter out vehicles with major std deviation in delay times
    mean = vehicle_id_grp["Min Delay"].mean()
    std = vehicle_id_grp["Min Delay"].std()

    vehicle_id_grp_no_major_std = vehicle_id_grp[
        (vehicle_id_grp["Min Delay"] < mean + 3 * std) &
        (vehicle_id_grp["Min Delay"] > mean - 3 * std)]

    vehicle_id_grp_major_std = vehicle_id_grp[
        (vehicle_id_grp["Min Delay"] > mean + 3 * std) |
        (vehicle_id_grp["Min Delay"] < mean - 3 * std)
    ]
    '''
    #plot delay by month excluding outliers
    filename = "Minutes of Delay by Month for " + str(i) + ", excluding major outliers"
    plt.scatter(vehicle_id_grp_no_major_std["Date"].dt.month, vehicle_id_grp_no_major_std["Min Delay"])
    plt.xlabel("Month")
    plt.ylabel("Min Delay")
    plt.title(filename)
    plt.savefig(filename, dpi=300)
    
    '''

    #plot delay by time excluding outliers
    '''
    filename = "Minutes of Delay by hour for " + str(i) + ", excluding outliers"
    plt.scatter(vehicle_id_grp_no_major_std["Time"].dt.hour, vehicle_id_grp_no_major_std["Min Delay"])
    plt.xlabel("hour")
    plt.ylabel("Minutes of Delay")
    plt.title(filename)
    plt.savefig(filename, dpi=300)
    '''
    """
    #plot count of delays by month excluding outliers
    min_delay_count_per_month = vehicle_id_grp_no_major_std.groupby(vehicle_id_grp_no_major_std["Date"].dt.month)["Min Delay"].count()
    plt.scatter(min_delay_count_per_month.index, min_delay_count_per_month.values)
    plt.xlabel("Month")
    plt.ylabel("Count of Delays")
    plt.title("Count of Delays by Month for " + str(i) + ", excluding outliers")
    plt.show()
    """

    #plot count of delays by month excluding outliers
    filename = "Count of Delays by Month in 2024 for " + str(i) + ", excluding outliers"
    min_delay_count_2024 = vehicle_id_grp_no_major_std[vehicle_id_grp_no_major_std["Date"].dt.year == 2024]
    min_delay_count_per_month = min_delay_count_2024.groupby(min_delay_count_2024["Date"].dt.month)["Min Delay"].count()
    plt.scatter(min_delay_count_per_month.index, min_delay_count_per_month.values)
    plt.xlabel("Month")
    plt.ylabel("Count of Delays")
    plt.title("Count of Delays by Month in 2024 for " + str(i) + ", excluding outliers")
    plt.savefig(filename, dpi=300)
    plt.show()
    
    """
    #plot count of delays by time excluding outliers
    min_delay_count_per_time = vehicle_id_grp_no_major_std.groupby(vehicle_id_grp_no_major_std["Time"].dt.hour)["Min Delay"].count()
    plt.scatter(min_delay_count_per_time.index, min_delay_count_per_time.values)
    plt.xticks(min_delay_count_per_time.index, [f"{h}:00" for h in min_delay_count_per_time.index])
    plt.yticks(min_delay_count_per_time.values, [str(y) for y in min_delay_count_per_time.values])
    plt.xlabel("Hour")
    plt.ylabel("Count of Delays")
    plt.title("Count of Delays by time for " + str(i) + " per hour, excluding major outliers")
    plt.show()
    """  

    # i will try using linear regression to see if there is a correlation between delay times and other factors

    #here im making dummy variables for categorical data
    streetcarscopy= vehicle_id_grp_no_major_std.copy()
    streetcarscopy = streetcarscopy.dropna() #just in case
    streetcarscopy['Year'] = streetcarscopy['Date'].dt.year
    streetcarscopy['Month'] = streetcarscopy['Date'].dt.month
    streetcarscopy['Day'] = streetcarscopy['Date'].dt.day
    streetcarscopy['DayOfWeek'] = streetcarscopy['Date'].dt.dayofweek
    streetcarscopy['Hour'] = streetcarscopy['Time'].dt.hour
    streetcarscopy['Minute'] = streetcarscopy['Time'].dt.minute
    streetcarscopy['Second'] = streetcarscopy['Time'].dt.second
    streetcarscopy = streetcarscopy.drop('Date', axis=1)
    streetcarscopy = streetcarscopy.drop('Time', axis=1)
    streetcarscopy = pd.get_dummies(
    streetcarscopy, 
    columns=["Line", "Bound", "Vehicle", "Year", "Day", "Month", "Hour", "DayOfWeek", "Minute", "Second", "Station"], 
    drop_first=True)
    

    #setting features and target variables
    features = streetcarscopy.drop(columns=["Min Delay"])

    target = streetcarscopy["Min Delay"]
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(features, target, test_size=0.2, random_state=42)
    from sklearn.linear_model import LinearRegression
    model = LinearRegression()
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    print("Linear Regression R^2 score for " + str(i) + ": " + str(model.score(X_test, y_test)))

    rf_model = RandomForestRegressor(
    n_estimators=200,   # number of trees
    max_depth=None,     # allow trees to grow fully
    random_state=42,
    n_jobs=-1) # use all available cores
    rf_model.fit(X_train, y_train)
    rf_pred = rf_model.predict(X_test)

    print(" Random Forest R^2:", r2_score(y_test, rf_pred))
    print(" Random Forest MAE:", mean_absolute_error(y_test, rf_pred))
    print(" Random Forest RMSE:", np.sqrt(mean_squared_error(y_test, rf_pred)))


