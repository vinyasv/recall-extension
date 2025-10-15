/**
 * Test data for evaluating semantic search functionality
 */

export interface TestPage {
  url: string;
  title: string;
  content: string;
  summary: string;
}

/**
 * Diverse test dataset covering different topics
 */
export const TEST_PAGES: TestPage[] = [
  // Programming & Tech
  {
    url: "https://react.dev/learn/thinking-in-react",
    title: "Thinking in React – React",
    content: "React is a JavaScript library for building user interfaces. When you build a UI in React, you will first break it into pieces called components. Then, you will describe the different visual states for each of your components. Finally, you will connect your components together so that the data flows through them. In this tutorial, we will guide you through the thought process of building a searchable product data table with React.",
    summary: "Learn how to build user interfaces with React by breaking down UIs into components, describing visual states, and connecting components with data flow. Tutorial covers building a searchable product table."
  },
  {
    url: "https://www.python.org/dev/peps/pep-0008/",
    title: "PEP 8 – Style Guide for Python Code",
    content: "This document gives coding conventions for the Python code comprising the standard library in the main Python distribution. Please see the companion informational PEP describing style guidelines for the C code in the C implementation of Python. This style guide evolves over time as additional conventions are identified and past conventions are rendered obsolete by changes in the language itself.",
    summary: "Official Python style guide covering coding conventions, naming standards, and best practices for writing clean, maintainable Python code."
  },
  {
    url: "https://docs.docker.com/get-started/",
    title: "Get started with Docker",
    content: "Docker is an open platform for developing, shipping, and running applications. Docker enables you to separate your applications from your infrastructure so you can deliver software quickly. With Docker, you can manage your infrastructure in the same ways you manage your applications. By taking advantage of Docker methodologies for shipping, testing, and deploying code quickly, you can significantly reduce the delay between writing code and running it in production.",
    summary: "Docker introduction covering containerization, application deployment, and infrastructure management for faster software delivery."
  },

  // Machine Learning & AI
  {
    url: "https://arxiv.org/abs/1706.03762",
    title: "Attention Is All You Need",
    content: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.",
    summary: "Groundbreaking paper introducing the Transformer architecture, which uses attention mechanisms instead of recurrent or convolutional layers for sequence modeling."
  },
  {
    url: "https://openai.com/blog/chatgpt",
    title: "ChatGPT: Optimizing Language Models for Dialogue",
    content: "We have trained a model called ChatGPT which interacts in a conversational way. The dialogue format makes it possible for ChatGPT to answer followup questions, admit its mistakes, challenge incorrect premises, and reject inappropriate requests. ChatGPT is a sibling model to InstructGPT, which is trained to follow an instruction in a prompt and provide a detailed response.",
    summary: "OpenAI announces ChatGPT, a conversational AI model trained for dialogue that can answer questions, admit mistakes, and engage in interactive conversations."
  },
  {
    url: "https://huggingface.co/docs/transformers/index",
    title: "Transformers Documentation - Hugging Face",
    content: "Transformers provides thousands of pretrained models to perform tasks on different modalities such as text, vision, and audio. These models can be applied on text for tasks like classification, information extraction, question answering, summarization, translation, and text generation in over 100 languages. They provide APIs to quickly download and use pretrained models on your own text.",
    summary: "Hugging Face Transformers library documentation covering pretrained models for NLP, computer vision, and audio tasks with simple APIs."
  },

  // Cooking & Recipes
  {
    url: "https://www.seriouseats.com/perfect-pan-pizza-recipe",
    title: "The Best Pan Pizza Recipe",
    content: "This pan pizza recipe creates a crispy, thick, and airy crust that rivals any pizzeria. The secret is a cold fermentation process that develops complex flavors and creates those signature air bubbles. The cast iron pan creates a golden, crispy bottom while the top gets beautifully charred under the broiler. Top with your favorite ingredients and enjoy restaurant-quality pizza at home.",
    summary: "Recipe for making crispy pan pizza with cold fermentation technique using a cast iron skillet for restaurant-quality results at home."
  },
  {
    url: "https://cooking.nytimes.com/recipes/1024069-chocolate-chip-cookies",
    title: "Perfect Chocolate Chip Cookies - NYT Cooking",
    content: "These chocolate chip cookies are the perfect combination of crispy edges and chewy centers. The dough benefits from an overnight rest in the refrigerator, which allows the flour to fully hydrate and the flavors to develop. Use high-quality chocolate and do not skip the sea salt on top because it takes these cookies from good to extraordinary.",
    summary: "Classic chocolate chip cookie recipe with overnight dough rest for optimal texture and flavor, topped with sea salt."
  },

  // Travel
  {
    url: "https://www.lonelyplanet.com/japan/kyoto",
    title: "Kyoto Travel Guide - Lonely Planet",
    content: "Kyoto is old Japan writ large: atmospheric temples, sublime gardens, traditional wooden machiya houses, and geisha scurrying to secret liaisons. This ancient capital still has the power to take your breath away. With 17 UNESCO World Heritage Sites, Kyoto is packed with cultural treasures. Visit the golden pavilion of Kinkaku-ji, walk the thousands of vermilion torii gates at Fushimi Inari, and experience a traditional tea ceremony.",
    summary: "Travel guide to Kyoto featuring ancient temples, traditional culture, UNESCO sites including Kinkaku-ji and Fushimi Inari shrines."
  },
  {
    url: "https://www.nomadicmatt.com/travel-blogs/iceland-travel-guide/",
    title: "Iceland Travel Guide: Budget Tips and Itinerary",
    content: "Iceland is a land of stunning natural beauty with dramatic waterfalls, massive glaciers, active volcanoes, and the mesmerizing Northern Lights. While expensive, it is possible to visit on a budget by camping, cooking your own meals, and planning strategically. The Golden Circle route, South Coast, and Blue Lagoon are must-sees. Summer offers midnight sun while winter provides aurora viewing opportunities.",
    summary: "Budget travel guide to Iceland covering natural attractions like waterfalls, glaciers, Northern Lights, and the Golden Circle route."
  },

  // Finance & Investing
  {
    url: "https://www.investopedia.com/terms/i/indexfund.asp",
    title: "Index Fund: Definition, How It Works, and Investment Strategy",
    content: "An index fund is a type of mutual fund or exchange-traded fund with a portfolio constructed to match or track the components of a financial market index, such as the S&P 500. An index fund provides broad market exposure, low operating expenses, and low portfolio turnover. These funds follow their benchmark index regardless of market conditions.",
    summary: "Explanation of index funds as low-cost investment vehicles that track market indices like the S&P 500 with minimal management."
  },
  {
    url: "https://www.bogleheads.org/wiki/Three-fund_portfolio",
    title: "Three-fund portfolio - Bogleheads",
    content: "A three-fund portfolio is a simple yet effective investment strategy that uses only three funds: a US stock market index fund, an international stock market index fund, and a bond market index fund. This approach provides diversification across asset classes and geographic regions while keeping costs low. The simplicity makes it easy to maintain and rebalance.",
    summary: "Investment strategy using three index funds for broad diversification: US stocks, international stocks, and bonds."
  },

  // Health & Fitness
  {
    url: "https://www.strongerbyscience.com/hypertrophy-range/",
    title: "The Hypertrophy Rep Range - Myth or Fact?",
    content: "For decades, bodybuilders and trainers have recommended 8-12 reps per set for building muscle. However, recent research shows that you can build muscle effectively with a much wider range of rep ranges, from as low as 5 reps to as high as 30+ reps per set, as long as you train close to failure. Total training volume matters more than the specific rep range.",
    summary: "Research-backed article debunking the myth that 8-12 reps is required for muscle growth; any rep range works if trained near failure."
  },
  {
    url: "https://www.sleepfoundation.org/sleep-hygiene",
    title: "Sleep Hygiene: Good Sleep Habits",
    content: "Sleep hygiene refers to healthy sleep habits that can improve your ability to fall asleep and stay asleep. Good sleep hygiene includes maintaining a consistent sleep schedule, creating a restful environment, limiting screen time before bed, avoiding caffeine in the afternoon, and getting regular exercise. Quality sleep is essential for physical health, mental wellbeing, and cognitive function.",
    summary: "Guide to improving sleep quality through consistent schedules, bedroom environment optimization, and lifestyle habits."
  },

  // Climate & Environment
  {
    url: "https://climate.nasa.gov/evidence/",
    title: "Climate Change Evidence - NASA",
    content: "Multiple lines of scientific evidence show that the climate system is warming. The current warming trend is extremely likely to be the result of human activity since the mid-20th century. Ice cores, tree rings, ocean sediments, and coral reefs all provide evidence of changing climate. Carbon dioxide levels are higher than at any point in at least the past 800,000 years.",
    summary: "NASA presents scientific evidence for climate change including ice core data, rising CO2 levels, and temperature records."
  },

  // History
  {
    url: "https://www.britannica.com/event/Roman-Empire",
    title: "Roman Empire - Ancient History",
    content: "The Roman Empire was the post-Republican period of ancient Rome, characterized by an autocratic form of government and large territorial holdings around the Mediterranean. It was one of the largest empires in world history, at its peak spanning from Britain to Egypt and from Spain to Mesopotamia. The empire had lasting impacts on law, architecture, language, and government systems that continue to influence Western civilization.",
    summary: "Overview of the Roman Empire, its vast territorial expansion, and lasting influence on Western law, architecture, and governance."
  },
];

