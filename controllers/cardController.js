"use strict";

const pokemon = require("pokemontcgsdk");
pokemon.configure({ apikey: process.env.POKE_API_KEY });

const Card = require("../models/card");
const User = require("../models/user");
const getRarityRating = require("../helpers/getRarityRating");
const handle = require("../helpers/errorHandler");
const errs = require("../helpers/errs");
const sort = require("../helpers/sort");
const filterPrize = require("../helpers/filterPrize");
const filterElite = require("../helpers/filterElite")

/* 

  TABLE OF CONTENTS
    - View Cards
    - Update/Delete Cards
    - Add Cards
    - Sort Cards
    - Filter Cards
*/

// ################# View Cards ##################

// Handle display collection on GET
exports.display_collection_get = async (req, res, next) => {
  const [errUser, user] = await handle(User.findById(req.user._id).populate("cards").exec())
  if (errUser) return next(errUser);
  if (!user) return next(errs.userNotFound());

  const card_list = user.cards.sort(sort.byValueDesc);
  const total = card_list.reduce((acc, next) => acc + next.value.market, 0);

  return res.render("home", {
    title: "My Collection",
    card_list,
    total
  });
};

// Handle display card detail on GET
exports.display_card_get = async (req, res, next) => {
  const cardId = req.params.id;
  const [errCard, card] = await handle(Card.findById(cardId).exec());
  if (errCard) return next(errCard);
  if (!card) return next(errs.cardNotFound())

  return res.render("card-detail", {
    title: `Collection: ${card.pokemon.name}`,
    card
  });
};

// Handle display prize binder on GET
exports.display_prize_get = async (req, res, next) => {
  const userId = req.user._id;
  const [errUser, user] = await handle(User.findById(userId).populate("prize").exec());
  if (errUser) return next(errUser);
  if (!user) return next(errs.userNotFound());

  const cards = user.prize;

  const total = cards.reduce((acc, next) => acc + next.value.market, 0);

  const trainer = cards.filter(card => card.meta.supertype !== "Pokémon").sort(sort.byValueDesc);
  const illustrator = cards.filter(card => filterPrize(card, -3)).sort(sort.byValueDesc);
  const fullArt = cards.filter(card => filterPrize(card, -2)).sort(sort.byValueDesc);
  const vSpecial = cards.filter(card => filterPrize(card, -1)).sort(sort.byValueDesc);
  const halfArt = cards.filter(card => filterPrize(card, 0)).sort(sort.byValueDesc);
  const specialHolo = cards.filter(card => filterPrize(card, 1)).sort(sort.byValueDesc);
  const holo = cards.filter(card => filterPrize(card, 2)).sort(sort.byValueDesc);

  return res.render("binder-prize", {
    title: "Prize Binder",
    illustrator,
    full_art: fullArt,
    v_special: vSpecial,
    half_art: halfArt,
    special_holo: specialHolo,
    holo,
    trainer,
    total
  });
};

// Handle display elite binder on GET
exports.display_elite_get = async (req, res, next) => {
  const userId = req.user._id;
  const [errUser, user] = await handle(User.findById(userId).populate("elite").exec());
  if (errUser) return next(errUser);
  if (!user) return next(errs.userNotFound());

  const cards = user.elite;

  const trainer = cards.filter(card => card.meta.supertype !== "Pokémon").sort(sort.byValueDesc);
  const wotc = cards.filter(card => filterElite(card, true)).sort(sort.byValueDesc)
  const elite = cards.filter(card => filterElite(card, false)).sort(sort.byValueDesc)


  const total = cards.reduce((acc, next) => acc + next.value.market, 0);
  cards.sort(sort.byValueDesc);

  return res.render("binder-elite", {
    title: "Elite Binder",
    wotc,
    elite,
    trainer,
    total: total
  });
};

// ################# Update/Delete Cards ##################

// Handle update price history
exports.update_price_history_post = async (req, res, next) => {
  const cardId = req.params.id;
  const pokemonId = req.body.cardId;
  const newDate = new Date().toLocaleDateString("en-US");

  const [errCard, card] = await handle(Card.findById(cardId).exec());
  if (errCard) return next(errCard);
  if (!card) return next(errs.cardNotFound());

  const [errTcgCard, tcgCard] = await handle(pokemon.card.find(pokemonId));
  if (errTcgCard) return next(errTcgCard);
  if (!tcgCard) return next(errs.cardNotFound());

  const marketVal = tcgCard.tcgplayer.prices[card.value.priceType].market
  if (!marketVal) return next(errs.priceNotFound);

  card.value.market = marketVal;

  const mostRecentDate = card.value.priceHistory[0][0];
  if (mostRecentDate !== newDate)
    card.value.priceHistory.unshift([newDate, marketVal]);

  const [errCardSave, _] = await handle(card.save());
  if (errCardSave) return next(errCardSave);

  return res.redirect(`/collection/${card._id}`);
};

exports.delete_card_get = async (req, res, next) => {
  const cardId = req.params.id;

  const [errCard, card] = await handle(Card.findById(cardId).exec());
  if (errCard) return next(errCard);
  if (!card) return next(errs.cardNotFound());

  return res.render("card-delete", {
    title: `Delete ${card.pokemon.name}`,
    cardId: card._id,
    cardName: card.pokemon.name
  });
};

exports.delete_card_post = async (req, res, next) => {
  const userId = req.user._id;
  const cardId = req.body.cardId;

  const [errUser, user] = await handle(User.findById(userId).exec());
  if (errUser) return next(errUser);
  if (!user) return next(errs.userNotFound());

  const idx = user.cards.indexOf(cardId);
  user.cards.splice(idx, 1);

  const delPromise = Card.findByIdAndRemove(cardId).exec();
  const savePromise = user.save()
  const [errPromise, _] = await handle(Promise.all([delPromise, savePromise]));
  if (errPromise) return next(errPromise);

  return res.redirect("/collection/home");
};

// Handle select binder on POST
exports.select_binder_post = async (req, res, next) => {
  const userId = req.user._id;
  const binder = req.body.binder;
  const cardId = req.body.objId;

  const [errUser, user] = await handle(User.findById(userId).exec());
  if (errUser) return next(errUser);
  if (!user) return next(errs.userNotFound());

  const prizeIdx = user.prize.indexOf(cardId);
  const eliteIdx = user.elite.indexOf(cardId);

  if (prizeIdx !== -1) user.prize.splice(prizeIdx, 1);
  if (eliteIdx !== -1) user.elite.splice(eliteIdx, 1);

  if (binder !== "none") user[binder].push(cardId);

  const [errSave, _] = await handle(user.save());
  if (errSave) return next(errSave);

  return res.redirect(`/collection/${cardId}`);
};

// Handle edit rarity on POST
exports.edit_card_rarity = async (req, res, next) => {
  const cardId = req.body.objId;
  const newRarityRating = req.body.rarity;

  const [errCard, card] = await handle(
    Card.findByIdAndUpdate(cardId, { "meta.rarity.grade": newRarityRating }).exec()
  );
  if (errCard) return next(errCard);
  if (!card) return next(errs.cardNotFound());

  return res.redirect(`/collection/${cardId}`)
};

// ################## Add Cards ###################

exports.add_card_post = async (req, res, next) => {
  const userId = req.user._id;
  const cardId = req.body.cardId;
  const revHolo = req.body.reverseHoloCheck === "true" ? true : false;

  const [errTcgCard, tcgCard] = await handle(pokemon.card.find(cardId));
  if (errTcgCard) return next(errTcgCard);
  if (!tcgCard) return next(errs.cardNotFound());

  let marketVal, priceType;

  const prices = tcgCard?.tcgplayer?.prices;
  if (!prices) return errs.noTcgPrice();

  if (revHolo) {
    marketVal = prices.reverseHolofoil.market || prices.reverseHolofoil.mid;
    priceType = "reverseHolofoil";
  } else if (prices.holofoil) {
    marketVal = prices.holofoil.market || prices.holofoil.mid;
    priceType = "holofoil";
  } else if (prices.normal) {
    marketVal = prices.normal.market || prices.normal.mid;
    priceType = "normal";
  } else if (prices.unlimited) {
    marketVal = prices.unlimited.market || prices.unlimited.mid;
    priceType = "unlimited";
  } else if (prices.unlimitedHolofoil) {
    marketVal = prices.unlimitedHolofoil.market || prices.unlimitedHolofoil.mid;
    priceType = "unlimitedHolofoil";
  } else if (prices["1stEditionHolofoil"]) {
    marketVal = prices["1stEditionHolofoil"].market || prices["1stEditionHolofoil"].mid;
    priceType = "1stEditionHolofoil";
  } else if (prices["1stEdition"]) {
    marketVal = prices["1stEdition"].market || prices["1stEdition"].mid;
    priceType = "1stEdition";
  } else {
    return next(errs.noTcgPrice());
  }

  console.log(tcgCard.rarity)

  const card = new Card({
    id: tcgCard.id,
    meta: {
      images: {
        small: tcgCard.images.small,
        large: tcgCard.images.large
      },
      rarity: {
        type: tcgCard.rarity || "Unknown",
        grade: getRarityRating[tcgCard.rarity || "Unknown"],
        reverseHolo: revHolo
      },
      supertype: tcgCard.supertype,
      subtypes: tcgCard.subtypes,
      set: {
        symbol: tcgCard.set.images.symbol,
        logo: tcgCard.set.images.logo,
        name: tcgCard.set.name,
        id: tcgCard.set.id,
        series: tcgCard.set.series,
        number: tcgCard.number,
        totalPrint: tcgCard.set.printedTotal,
        releaseDate: tcgCard.set.releaseDate
      }
    },
    pokemon: { name: tcgCard.name },
    value: {
      market: marketVal,
      priceHistory: [[new Date().toLocaleDateString("en-US"), marketVal.toFixed(2)]],
      priceType: priceType,
    }
  });

  const [errSave, _] = await handle(card.save());
  if (errSave) return next(errSave);

  const [errUpdate, update] = await handle(
    User.findByIdAndUpdate(userId, { $push: { cards: card._id } }).exec()
  );
  if (errUpdate) return next(errUpdate);

  return res.redirect(`/collection/sets#${card.meta.set.id}`);
};

// ################# Sort Cards ###################
// Handle display collection sorted on GET
exports.display_collection_sorted_get = async (req, res, next) => {
  const userId = req.user._id;
  const sortBy = req.query.by;
  const sortAsc = req.query.asc;

  const [errUser, user] = await handle(User.findById(userId).populate("cards").exec());
  if (errUser) return next(errUser);
  if (!user) return next(errs.userNotFound());
  
  const cards = user.cards;
  const total = cards.reduce((acc, next) => acc + next.value.market, 0);
  
  let sorted;

  if (sortBy === "value")
    sorted = !sortAsc ? cards.sort(sort.byValueDesc) : cards.sort(sort.byValueAsc);
  else if (sortBy === "rarity")
    sorted = !sortAsc ? cards.sort(sort.byRarityDesc) : cards.sort(sort.byRarityAsc);
  else if (sortBy === "name")
    sorted = !sortAsc ? cards.sort(sort.byNameDesc) : cards.sort(sort.byNameAsc);
  else if (sortBy === "set")
    sorted = !sortAsc ? cards.sort(sort.bySetDesc) : cards.sort(sort.bySetAsc);
  else if (sortBy === "supertype")
    sorted = !sortAsc ? cards.sort(sort.bySupertypeDesc) : cards.sort(sort.bySupertypeAsc);
  else return redirect("/collection/home");

  return res.render("home", {
    title: "My Collection",
    card_list: sorted,
    total: total
  });
};

// ################ Filter Cards ##################
// Handle display cards by set on GET
exports.display_filter_by_set_get = async (req, res, next) => {
  const userId = req.user._id;

  const [errUser, user] = await handle(User.findById(userId).populate("cards").exec());
  if (errUser) return next(errUser);
  if (!user) return next(errs.userNotFound());

  
  // Find which sets exist in collection
  const setOrder = {};
  user.cards.forEach(card => {
    const setId = card.meta.set.id;
    if (!(setId in setOrder)) setOrder[setId] = [card.meta.set.name, card.meta.set.releaseDate];
  })

  // Sort sets by date
  const setArr = [];
  for (const set in setOrder) setArr.push([set, setOrder[set]]);
  // console.log(setArr)
  setArr.sort(sort.byDateDesc);
  for (let i = 0; i < setArr.length; i++) setOrder[setArr[i][0]] = i;


  // Create array with unique empty arrays
  const orderedSets = Array.from(Array(setArr.length), () => []);

  // Add cards to sets in array
  user.cards.forEach(card => {
    const idx = setArr.findIndex(s => s[0] === card.meta.set.id);
    orderedSets[idx].push(card);
  })
  
  // Sort cards within sets
  for (const s of orderedSets) {
    s.sort(sort.byCardNumber);
  }

  return res.render("sets-collection", {
    title: "Set Collection",
    list_sets: orderedSets
  });
};


// Handle get filter page
exports.display_filter_page_get = async (req, res, next) => {
  const userId = req.user._id;
  let results = [];

  const [errUser, user] = await handle(User.findById(userId).populate("cards").exec());
  if (errUser) return next(errUser);
  if (!user) return next(errs.userNotFound());

  // Populate form data
  const collection = user.cards;
  const setsSet = new Set();
  const subtypesSet = new Set();
  const raritiesSet = new Set();

  collection.forEach((card) => {
    setsSet.add(
      `${card.meta.set.releaseDate}||${card.meta.set.id}||${card.meta.set.name}`
    );

    card.meta.subtypes.forEach((subtype) => subtypesSet.add(subtype));

    raritiesSet.add(card.meta.rarity.type);
  });

  const sets = Array.from(setsSet)
    .map((set) => set.split("||"))
    .sort((a, b) => {
      if (a[0] < b[0]) return 1;
      if (a[0] > b[0]) return -1;
      return 0;
    });

  const subtypes = Array.from(subtypesSet).sort();
  const rarities = Array.from(raritiesSet).sort();

  let savedQuery = {};

  // Filter data if filter request
  if (req.query.asc) {
    savedQuery = {
      value: req.query.value,
      reverseholo: req.query.reverseholo,
      compareValue: req.query.compareValue,
      name: req.query.name,
      rarities: req.query.rarities,
      supertypes: req.query.supertypes,
      subtypes: req.query.subtypes,
      sets: req.query.setid,
      sortby: req.query.sortby,
      asc: req.query.asc === "true" ? true : false
    };

    // Run through queries
    const byReverse = !savedQuery.reverseholo
      ? collection
      : collection.filter((card) => card.meta.rarity.reverseHolo);

    const byVal = byReverse.filter((card) => {
      if (savedQuery.compareValue === ">=") 
        return card.value.market >= Number(savedQuery.value);
      else return card.value.market <= Number(savedQuery.value);
    });

    const byName = byVal.filter((card) => {
      return card.pokemon.name
        .toLowerCase()
        .includes(savedQuery.name.toLowerCase());
    });

    const byRare = !savedQuery.rarities
      ? byName
      : byName.filter((card) => {
          if (!Array.isArray(savedQuery.rarities))
            savedQuery.rarities = [savedQuery.rarities];
          return savedQuery.rarities.includes(card.meta.rarity.type);
        });

    const bySupertypes = !savedQuery.supertypes
      ? byRare
      : byRare.filter((card) => {
          if (!Array.isArray(savedQuery.supertypes))
            savedQuery.supertypes = [savedQuery.supertypes];
          return savedQuery.supertypes.includes(card.meta.supertype);
        });

    const bySubtypes = !savedQuery.subtypes
      ? bySupertypes
      : bySupertypes.filter((card) => {
          let check = 0;
          if (!Array.isArray(savedQuery.subtypes))
            savedQuery.subtypes = [savedQuery.subtypes];

          card.meta.subtypes.forEach((subtype) => {
            if (savedQuery.subtypes.includes(subtype)) check++;
          });
          return check > 0;
        });

    const bySets = !savedQuery.sets
      ? bySubtypes
      : bySubtypes.filter((card) => {
          if (!Array.isArray(savedQuery.sets))
            savedQuery.sets = [savedQuery.sets];
          return savedQuery.sets.includes(card.meta.set.id);
        });

    const sortBy = savedQuery.sortby;
    const sortAsc = savedQuery.asc;

    let cards;

    if (sortBy === "value")
      cards = !sortAsc ? bySets.sort(sort.byValueDesc) : cards = bySets.sort(sort.byValueAsc);
    else if (sortBy === "rarity")
      cards = !sortAsc ? bySets.sort(sort.byRarityDesc) : cards = bySets.sort(sort.byRarityAsc);
    else if (sortBy === "name")
      cards = !sortAsc ? bySets.sort(sort.byNameDesc) : bySets.sort(sort.byNameAsc);
    else if (sortBy === "set")
      cards = !sortAsc ? bySets.sort(sort.bySetDesc) : cards = bySets.sort(sort.bySetAsc);
    else if (sortBy === "supertype")
      cards = !sortAsc ? bySets.sort(sort.bySupertypeDesc): cards = bySets.sort(sort.bySupertypeAsc);
    results = cards;
  }

  const page_data = {
    title: "Filter Collection",
    sets,
    subtypes,
    rarities,
    savedQuery,
    results
  };

  return res.render("filter-collection", page_data);
};