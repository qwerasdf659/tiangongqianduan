import { defineComponent, h } from 'vue';

export const IconReceipt = defineComponent({
  name: 'IconReceipt',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M832 128H192c-35.3 0-64 28.7-64 64v640c0 35.3 28.7 64 64 64h640c35.3 0 64-28.7 64-64V192c0-35.3-28.7-64-64-64zM704 768H320v-64h384v64zm0-128H320v-64h384v64zm0-128H320v-64h384v64zm0-128H320V320h384v64z", "fillRule": "evenodd"})
      ]
    );
  }
});
