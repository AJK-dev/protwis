from build.management.commands.base_build import Command as BaseBuild
from django.db.models import Q
from django.conf import settings

from protein.models import Protein, ProteinConformation, ProteinAnomaly, ProteinState, ProteinSegment, ProteinGProteinPair
from residue.models import Residue
from residue.functions import dgn, ggn
from structure.models import *
from structure.functions import HSExposureCB, PdbStateIdentifier
from common.alignment import AlignedReferenceTemplate, GProteinAlignment
from common.definitions import *
from common.models import WebLink
from signprot.models import SignprotComplex
import structure.structural_superposition as sp
import structure.assign_generic_numbers_gpcr as as_gn
import structure.homology_models_tests as tests

import Bio.PDB as PDB
from modeller import *
from modeller.automodel import *
from collections import OrderedDict
import os
import shlex
import logging
import pprint
from io import StringIO, BytesIO
import sys
import re
import zipfile
import shutil
import math
from copy import deepcopy
from datetime import datetime, date
import yaml
import traceback


startTime = datetime.now()
logger = logging.getLogger('homology_modeling')
hdlr = logging.FileHandler('./logs/homology_modeling.log')
formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s')
hdlr.setFormatter(formatter)
logger.addHandler(hdlr) 
logger.setLevel(logging.INFO)
structure_path = './structure/'
pir_path = os.sep.join([structure_path, 'PIR'])

build_date = date.today()

import warnings
warnings.filterwarnings("ignore")

class Command(BaseBuild):  
    help = 'Build automated chimeric GPCR homology models'
    
    def add_arguments(self, parser):
        super(Command, self).add_arguments(parser=parser)
        parser.add_argument('-f', help='Specify file name to be uploaded to GPCRdb', default=False, type=str, nargs='+')
        parser.add_argument('-c', help='Upload only complex models to GPCRdb', default=False, action='store_true')
        
    def handle(self, *args, **options):
        if options['c']:
            path = './structure/complex_models_zip/'
        else:
            path = './structure/homology_models_zip/'
        if not os.path.exists(path):
            os.mkdir(path)
        if options['f']:
            files = options['f']
        else:
            files = os.listdir(path)
        for f in files:
            if f.endswith('.zip'):
                modelname = f.split('.')[0]
                mod_dir = path+modelname
                if not os.path.exists(mod_dir):
                    os.mkdir(mod_dir)
                zip_mod = zipfile.ZipFile(path+f, 'r')
                zip_mod.extractall(mod_dir)
                zip_mod.close()
                self.upload_to_db(modelname, path)

    def upload_to_db(self, modelname, path):
        ''' Upload to model to StructureModel and upload segment and rotamer info to StructureModelStatsSegment and
            StructureModelStatsRotamer.
        '''
        name_list = modelname.split('_')
        if name_list[3] in ['Inactive','Active','Intermediate']:
            self.complex = False
            self.revise_xtal = False
            gpcr_class = name_list[0][-1]
            gpcr_prot = '{}_{}'.format(name_list[1],name_list[2])
            state = name_list[3]
            main_structure = name_list[4]
            build_date = name_list[5]
        elif name_list[4]=='refined':
            self.complex = False
            self.revise_xtal = True
            gpcr_class = name_list[0][-1]
            gpcr_prot = '{}_{}'.format(name_list[1],name_list[2])
            state = name_list[5]
            main_structure = name_list[3]
            build_date = name_list[6]
        else:
            self.complex = True
            self.revise_xtal = False
            gpcr_class = name_list[0][-1]
            gpcr_prot = '{}_{}'.format(name_list[1],name_list[2].split('-')[0])
            sign_prot = '{}_{}'.format(name_list[2].split('-')[1], name_list[3])
            main_structure = name_list[4]
            build_date = name_list[5]

        with open(os.sep.join([path, modelname, modelname+'.pdb']), 'r') as pdb_file:
            pdb_data = pdb_file.read()
        with open(os.sep.join([path, modelname, modelname+'.templates.csv']), 'r') as templates_file:
            templates = templates_file.readlines()
        with open(os.sep.join([path, modelname, modelname+'.template_similarities.csv']), 'r') as sim_file:
            similarities = sim_file.readlines()

        # Refined xtal
        if self.revise_xtal!=False:
            try:
                hommod = Structure.objects.get(pdb_code__index=main_structure+'_refined', refined=True)
                hommod.pdb_data.pdb = pdb_data
                hommod.stats_text.stats_text = ''.join(templates)
                hommod.pdb_data.save()

                original = Structure.objects.get(pdb_code__index=main_structure)

                # Delete previous data
                StructureRefinedStatsRotamer.objects.filter(structure=hommod).delete()
                StructureRefinedSeqSim.objects.filter(structure=hommod).delete()
            except:
                original = Structure.objects.get(pdb_code__index=main_structure)
                wl = WebLink.objects.create(index=main_structure+'_refined', web_resource=original.pdb_code.web_resource)
                pdb = PdbData.objects.create(pdb=pdb_data)
                stats_text = StatsText.objects.create(stats_text=''.join(templates))
                prot_conf = ProteinConformation.objects.get(protein=original.protein_conformation.protein.parent)
                hommod = Structure.objects.create(preferred_chain=original.preferred_chain, resolution=original.resolution, publication_date=original.publication_date,
                                                  representative=original.representative, annotated=original.annotated, distance=original.distance, pdb_code=wl, pdb_data=pdb,
                                                  protein_conformation=prot_conf, publication=original.publication, state=original.state,
                                                  structure_type=original.structure_type, refined=True, stats_text=stats_text)
            # bulk add to StructureRefinedStatsRotamer
            structure_refined_stats_rotamers = []
            for r in templates[1:]:
                r = r.split(',')
                res = Residue.objects.get(protein_conformation__protein__entry_name=gpcr_prot, sequence_number=r[1])
                if r[4]=='None':
                    bb_s = None
                else:
                    bb_s = Structure.objects.get(pdb_code__index=r[4])
                if r[5][:-1]=='None':
                    r_s = None
                else:
                    r_s = Structure.objects.get(pdb_code__index=r[5][:-1])
                srsr = StructureRefinedStatsRotamer()
                srsr.structure, srsr.residue, srsr.backbone_template, srsr.rotamer_template = hommod, res, bb_s, r_s
                structure_refined_stats_rotamers.append(srsr)
            StructureRefinedStatsRotamer.objects.bulk_create(structure_refined_stats_rotamers)

            structure_refined_seq_sims = []
            for s in similarities[1:]:
                s = s.split(',')
                s_s = Structure.objects.get(pdb_code__index=s[0])
                srss = StructureRefinedSeqSim()
                srss.structure, srss.template, srss.similarity = hommod, s_s, s[1]
                structure_refined_seq_sims.append(srss)
            StructureRefinedSeqSim.objects.bulk_create(structure_refined_seq_sims)

        # Complex model
        elif self.complex:
            m_s = Structure.objects.get(pdb_code__index=main_structure)
            r_prot = Protein.objects.get(entry_name=gpcr_prot)
            s_prot = Protein.objects.get(entry_name=sign_prot)
            signprot_complex = SignprotComplex.objects.get(structure__pdb_code__index=main_structure)
            
            try:
                pair = ProteinGProteinPair.objects.get(protein=r_prot, g_protein__slug=s_prot.family.slug)
            except:
                pair = None
            try:
                hommod = StructureComplexModel.objects.get(receptor_protein=gpcr_prot, sign_prot=sign_prot)
                hommod.main_template = m_s
                hommod.pdb_data.pdb = pdb_data
                hommod.version = build_date
                hommod.prot_signprot_pair = pair
                hommod.stats_text.stats_text = ''.join(templates)
                hommod.save()

                # Delete previous data
                StructureComplexModelStatsRotamer.objects.filter(homology_model=hommod).delete()
                StructureComplexModelSeqSim.objects.filter(homology_model=hommod).delete()
            except Exception as msg:
                stats_text = StatsText.objects.create(stats_text=''.join(templates))
                pdb_data = PdbData.objects.create(pdb=pdb_data)
                hommod = StructureComplexModel.objects.create(receptor_protein=r_prot, sign_protein=s_prot, 
                                                                main_template=m_s, 
                                                                pdb_data=pdb_data, 
                                                                version=build_date,
                                                                prot_signprot_pair=pair,
                                                                stats_text=stats_text)
            res_prot = r_prot
            bulk_residues = []
            for r in templates[1:]:
                r = r.split(',')
                if r[0]=='HN':
                    res_prot = s_prot
                elif r[0]=='Beta':
                    res_prot = signprot_complex.beta_protein
                elif r[0]=='Gamma':
                    res_prot = signprot_complex.gamma_protein
                res = Residue.objects.get(protein_conformation__protein=res_prot, sequence_number=r[1])
                scmsr = StructureComplexModelStatsRotamer()
                if r[4]=='None':
                    bb_s = None
                else:
                    bb_s = Structure.objects.get(pdb_code__index=r[4])
                if r[5][:-1]=='None':
                    r_s = None
                else:
                    r_s = Structure.objects.get(pdb_code__index=r[5][:-1])
                scmsr.homology_model, scmsr.residue, scmsr.protein, scmsr.backbone_template, scmsr.rotamer_template = hommod, res, res_prot, bb_s, r_s
                bulk_residues.append(scmsr)
            StructureComplexModelStatsRotamer.objects.bulk_create(bulk_residues)

            bulk_sims = []
            for s in similarities[1:]:
                s = s.split(',')
                s_s = Structure.objects.get(pdb_code__index=s[0])
                srss = StructureComplexModelSeqSim()
                srss.homology_model, srss.template, srss.similarity = hommod, s_s, s[1]
                bulk_sims.append(srss)
            StructureComplexModelSeqSim.objects.bulk_create(bulk_sims)
            
        # Homology model
        else:
            s_state=ProteinState.objects.get(name=state)
            m_s = Structure.objects.get(pdb_code__index=main_structure)
            prot = Protein.objects.get(entry_name=gpcr_prot)
            try:
                hommod = StructureModel.objects.get(protein__entry_name=gpcr_prot, state=s_state)
                hommod.main_template = m_s
                hommod.pdb_data.pdb = pdb_data
                hommod.version = build_date
                hommod.stats_text.stats_text = ''.join(templates)
                hommod.save()

                # Delete previous data
                StructureModelStatsRotamer.objects.filter(homology_model=hommod).delete()
                StructureModelSeqSim.objects.filter(homology_model=hommod).delete()
            except Exception as msg:
                stats_text = StatsText.objects.create(stats_text=''.join(templates))
                pdb_data = PdbData.objects.create(pdb=pdb_data)
                hommod = StructureModel.objects.create(protein=prot, state=s_state, 
                                                        main_template=m_s, 
                                                        pdb_data=pdb_data, 
                                                        version=build_date,
                                                        stats_text=stats_text)
            bulk_residues = []
            for r in templates[1:]:
                r = r.split(',')
                res = Residue.objects.get(protein_conformation__protein__entry_name=gpcr_prot, sequence_number=r[1])
                rot = StructureModelStatsRotamer()
                if r[4]=='None':
                    bb_s = None
                else:
                    bb_s = Structure.objects.get(pdb_code__index=r[4])
                if r[5][:-1]=='None':
                    r_s = None
                else:
                    r_s = Structure.objects.get(pdb_code__index=r[5][:-1])
                rot.homology_model, rot.residue, rot.backbone_template, rot.rotamer_template = hommod, res, bb_s, r_s
                bulk_residues.append(rot)
            StructureModelStatsRotamer.objects.bulk_create(bulk_residues)
                
            bulk_sims = []
            for s in similarities[1:]:
                s = s.split(',')
                s_s = Structure.objects.get(pdb_code__index=s[0])
                srss = StructureModelSeqSim()
                srss.homology_model, srss.template, srss.similarity = hommod, s_s, s[1]
                bulk_sims.append(srss)
            StructureModelSeqSim.objects.bulk_create(bulk_sims)
