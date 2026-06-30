export type IndustryId =
  | "fitness"
  | "beauty"
  | "food"
  | "real-estate"
  | "fashion"
  | "business"
  | "travel"
  | "parenting"
  | "tech"
  | "home";

export type IndustryOption = {
  id: IndustryId;
  label: string;
  searchQuery: string;
  hashtags: string[];
};

export const INDUSTRIES: IndustryOption[] = [
  {
    id: "fitness",
    label: "Fitness & Wellness",
    searchQuery: "fitness coach",
    hashtags: ["fitnesscoach", "personaltrainer", "fitnessmotivation"],
  },
  {
    id: "beauty",
    label: "Beauty & Skincare",
    searchQuery: "beauty influencer",
    hashtags: ["beautyblogger", "skincare", "makeuptutorial"],
  },
  {
    id: "food",
    label: "Food & Restaurants",
    searchQuery: "food blogger",
    hashtags: ["foodblogger", "foodie", "torontoeats"],
  },
  {
    id: "real-estate",
    label: "Real Estate",
    searchQuery: "real estate agent",
    hashtags: ["realestateagent", "realtor", "torontorealestate"],
  },
  {
    id: "fashion",
    label: "Fashion & Lifestyle",
    searchQuery: "fashion influencer",
    hashtags: ["ootd", "fashionblogger", "styleinspo"],
  },
  {
    id: "business",
    label: "Business & Marketing",
    searchQuery: "marketing consultant",
    hashtags: ["entrepreneur", "smallbusiness", "digitalmarketing"],
  },
  {
    id: "travel",
    label: "Travel & Hospitality",
    searchQuery: "travel creator",
    hashtags: ["travelblogger", "travelgram", "wanderlust"],
  },
  {
    id: "parenting",
    label: "Parenting & Family",
    searchQuery: "parenting influencer",
    hashtags: ["momlife", "parenting", "familyblogger"],
  },
  {
    id: "tech",
    label: "Tech & SaaS",
    searchQuery: "tech creator",
    hashtags: ["techreview", "saas", "startup"],
  },
  {
    id: "home",
    label: "Home & Interior Design",
    searchQuery: "interior design",
    hashtags: ["homedecor", "interiordesign", "homestyle"],
  },
];

export function getIndustry(id: string): IndustryOption | undefined {
  return INDUSTRIES.find((i) => i.id === id);
}
