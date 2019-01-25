from Bio.PDB import Selection, PDBParser
from Bio.PDB.NeighborSearch import NeighborSearch

from contactnetwork.interaction import *
from contactnetwork.pdb import *
from contactnetwork.models import *
from io import StringIO

from structure.models import Structure

import copy

# Distance between residues in peptide
NUM_SKIP_RESIDUES = 4

def compute_interactions(pdb_name,save_to_db = False):

    do_distances = True
    do_interactions = True
    distances = []
    classified = []

    # Ensure that the PDB name is lowercase
    pdb_name = pdb_name.lower()

    # Get the pdb structure
    struc = Structure.objects.get(protein_conformation__protein__entry_name=pdb_name)
    pdb_io = StringIO(struc.pdb_data.pdb)
    # Get the preferred chain
    preferred_chain = struc.preferred_chain.split(',')[0]

    # Get the Biopython structure for the PDB
    s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure('ref', pdb_io)[0]
    #s = pdb_get_structure(pdb_name)[0]
    chain = s[preferred_chain]
    #return classified, distances

     # remove residues without GN and only those matching receptor.
    residues = struc.protein_conformation.residue_set.exclude(generic_number=None).all().prefetch_related('generic_number')
    dbres = {}
    dblabel = {}
    for r in residues:
        dbres[r.sequence_number] = r
        dblabel[r.sequence_number] = r.generic_number.label
    ids_to_remove = []
    for res in chain:
        if not res.id[1] in dbres.keys() and res.get_resname() != "HOH":
            ids_to_remove.append(res.id)
    for i in ids_to_remove:
        chain.detach_child(i)

    if do_distances:
        for i1,res1 in enumerate(chain,1):
            if not is_water(res1):
                for i2,res2 in enumerate(chain,1):
                    if i2>i1 and not is_water(res2):
                        # Do not calculate twice.
                        distance = res1['CA']-res2['CA']
                        distances.append((dbres[res1.id[1]],dbres[res2.id[1]],distance,dblabel[res1.id[1]],dblabel[res2.id[1]]))

    if do_interactions:
        atom_list = Selection.unfold_entities(s[preferred_chain], 'A')
        # Search for all neighbouring residues
        ns = NeighborSearch(atom_list)
        all_neighbors = ns.search_all(4.5, "R")

        # Filter all pairs containing non AA residues
        all_aa_neighbors = [pair for pair in all_neighbors if is_aa(pair[0]) and is_aa(pair[1])]

        # Only include contacts between residues less that NUM_SKIP_RESIDUES sequence steps apart
        all_aa_neighbors = [pair for pair in all_aa_neighbors if abs(pair[0].id[1] - pair[1].id[1]) > NUM_SKIP_RESIDUES]

        # For each pair of interacting residues, determine the type of interaction
        interactions = [InteractingPair(res_pair[0], res_pair[1], get_interactions(res_pair[0], res_pair[1]),dbres[res_pair[0].id[1]], dbres[res_pair[1].id[1]],struc) for res_pair in all_aa_neighbors]

        # Split unto classified and unclassified.
        classified = [interaction for interaction in interactions if len(interaction.get_interactions()) > 0]

    if save_to_db: 

        if do_interactions:
            # Delete previous for faster load in
            InteractingResiduePair.objects.filter(referenced_structure=struc).all().delete()

            # bulk_pair = []
            # for d in distances:
            #     pair = InteractingResiduePair(res1=d[0], res2=d[1], referenced_structure=struc)
            #     bulk_pair.append(pair)

            # Create interaction dictionary
            interaction_pairs = {}
            for pair in classified:
                res_1 = pair.get_residue_1()
                res_2 = pair.get_residue_2()
                key =  res_1.get_parent().get_id()+str(res_1.get_id()[1]) + "_" + res_2.get_parent().get_id()+str(res_2.get_id()[1])
                interaction_pairs[key] = pair

            # POSSIBLE ADDON: support for multiple water-mediated bonds
            ## Obtain list of water molecules
            water_list = { water for residue in s[preferred_chain] if residue.get_resname() == "HOH" for water in residue.get_atoms() }
            if len(water_list) > 0:
                ## Iterate water molecules over residue atom list
                water_neighbors = [(water, match_res) for water in water_list
                                for match_res in ns.search(water.coord, 3.5, "R") if not is_water(match_res)]

                # intersect between residues sharing the same interacting water
                for index_one in range(len(water_neighbors)):
                    water_pair_one = water_neighbors[index_one]

                    for index_two in [ index for index in range(index_one+1, len(water_neighbors)) if water_pair_one[0]==water_neighbors[index][0] ]:
                        water_pair_two = water_neighbors[index_two]
                        res_1 = water_pair_one[1]
                        res_2 = water_pair_two[1]
                        key =  res_1.get_parent().get_id()+str(res_1.get_id()[1]) + "_" + res_2.get_parent().get_id()+str(res_2.get_id()[1])

                        # Check if interaction is polar - NOTE: this is not capturing every angle
                        if any(get_polar_interactions(water_pair_one[0].get_parent(), water_pair_one[1])) and any(get_polar_interactions(water_pair_two[0].get_parent(), water_pair_two[1])):
                            # NOTE: Is splitting of sidechain and backbone-mediated interactions desired?
                            if key in interaction_pairs:
                                interaction_pairs[key].interactions.append(WaterMediated())
                            else:
                                interaction_pairs[key] = InteractingPair(res_1, res_2, [WaterMediated()], dbres[res_1.id[1]], dbres[res_2.id[1]], struc)

            for p in classified:
                p.save_into_database()

        if do_distances:
            # Distance.objects.filter(structure=struc).all().delete()
            bulk_distances = []
            for i,d in enumerate(distances):
                distance = Distance(distance=int(100*d[2]),res1=d[0], res2=d[1],gn1=d[3], gn2=d[4], gns_pair='_'.join([d[3],d[4]]), structure=struc)
                bulk_distances.append(distance)
                if len(bulk_distances)>1000:
                    pairs = Distance.objects.bulk_create(bulk_distances)
                    bulk_distances = []

            pairs = Distance.objects.bulk_create(bulk_distances)



    return classified, distances
